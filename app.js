const express = require('express');
const app = express();
const axios = require('axios');
const path = require('path');
const db = require('./database/db-connector');
const converter = require('json-2-csv');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
app.use(express.json());
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded


var handlebars = require('express-handlebars').create({defaultLayout:'main'});
app.engine('handlebars', handlebars.engine);

app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));
app.set('port', process.argv[2]);

//Create static file references
app.use('/static', express.static('public')); //middleware
app.use(express.static(path.join(__dirname, 'public')));

// home page - displays table of supplies and add donation form for student
app.get('/', (req,res) => {
  let query1 = 'SELECT supply_id, supply_name, total_quantity_needed, quantity_still_needed FROM Supplies ORDER BY supply_name;';
  db.pool.query(query1, (err, results, field) => {
    let supplies = results;
    console.log(supplies);
    res.render('home', {supplies});
  });     
});

// students submits form to add donation
app.post('/addDonationForm', (req, res) => {
  console.log(req.body);
  let data = req.body;
  data.period = parseInt(data.period);
  data.supply_id = parseInt(data.supply_id);
  console.log(data);
  // add donation to Donations table 
  let query1 = "INSERT INTO Donations (donor_fname, donor_lname, donor_email, donor_period, supply_id) VALUES (?, ?, ?, ?, ?);";
  db.pool.query(query1,  Object.values(data), (err, results) => {
    if(err)
    {
      console.log(err);
      res.sendStatus(400);
    }
    else
    {
      console.log('results', results);
      console.log(results.insertId);
      console.log(data);
      let donation_id = results.insertId
      data.donation_id = donation_id;
      // get name of supply item that is being donated
      let query2 = `SELECT Supplies.supply_id as supply_id, supply_name FROM Donations JOIN Supplies ON Donations.supply_id = Supplies.supply_id WHERE donation_id="${donation_id}";`;
      db.pool.query(query2,  Object.values(data), (err, rows, fields) => {
        if(err)
        {
          console.log(err);
          res.sendStatus(400);
        }
        else
        {
          console.log("results of query 2: rows - ", rows);
          let supply_name = rows[0].supply_name;
          data.supply_name = supply_name;
          console.log('supply_id', data.supply_id);
          // update supply quantity_still_needed by decrementing by 1
          let query3 = `Update Supplies SET quantity_still_needed = quantity_still_needed - 1 WHERE supply_id = "${data.supply_id}";`
          db.pool.query(query3, (err, rows, fields) => {
            if(err)
            {
              console.log(err);
              res.sendStatus(400);
            }
            else
            {
              // send confirmation email using Scott's microservice
              // includes info in data above
              const item = {
                "emailTo": data.email,
                "email": "fisheali@oregonstate.edu",
                "name": data.fname ,
                "message": `Thank you for your donation! Please remember to bring your donated supply, ${data.supply_name} to class.\
                <br>If you made an error in selecting a supply item donation, you can update or delete your donation form on the Donation website.\
                <br>You will need this unique donation id as a reference: ${data.donation_id}.\
                <br>Thank you,<br/>Ms. Fisher`,
                "header": "Confirmation of classroom donation form",
              };

              console.log(item);
              axios
                .post('https://floating-shelf-48098.herokuapp.com/schoolsupplies', item
                )
                .then(function(response) {
                  console.log(response);
                  res.render('thanks', data);
                })
                .catch(function (error) {
                  console.log(error);
                  res.sendStatus(400);
                });              
            }
          })            
        }      
      });
    }
  });
});


// student clicks on update donation link on navbar or Donate page
// app.get('/updateDonation', (req,res) => {
//   // query1 to get list of supplies still needed
//   let query1 = 'SELECT supply_id, supply_name, total_quantity_needed, quantity_still_needed FROM Supplies ORDER BY supply_name;';
//   db.pool.query(query1)
//   .then(results => {
//     let supplies = results;
//     let data = {supplies};
//     res.render('updateDonation', data);
//   })
//   .catch(err => {
//     console.log(err);
//     res.sendStatus(400);
//   });
  
// });

// student goes to update donation page
app.get('/updateDonation', (req,res) => {
  // query1 to get list of supplies still needed to dynamically populate supplies dropdown
  let query1 = 'SELECT supply_id, supply_name, total_quantity_needed, quantity_still_needed FROM Supplies ORDER BY supply_name;';
  db.pool.query(query1, (err, results, field) => {
    if(err)
    {
      console.log(err);
      res.sendStatus(400);
    }
    else
    {
      let supplies = results;
      let data = {supplies};
      res.render('updateDonation', data);
    }

  });    
});


// student or teacher submits update donation form
// student must enter name and ID then updates
// teacher views prepopulated fields and can select different values to update
app.post('/updateDonation', (req,res) => {  
  let id = req.body.donation_id;
  let fname = req.body.fname;
  let lname = req.body.lname;
  let teacherView = req.body.teacherView; 
  /* 0  is student submission, 1 is teacher submission
  student submission - > receive confirmation email and gets sent to thanks page after successful submission
  teacher submission - > no email sent, gets sent back to donors page
  */
  console.log('id, fname, lname, teacherView ', id, fname, lname, teacherView)

  // check if name and donation ID matches (for student)
  let query1 = `SELECT donation_id, donor_fname, donor_lname, donor_email, d.supply_id, supply_name\
    FROM Donations AS d JOIN Supplies AS s ON d.supply_id = s.supply_id\
    WHERE donation_id = "${id}" AND donor_fname = "${fname}" AND donor_lname = "${lname}";`

  db.pool.query(query1, (err, results, field) => {
    console.log(results);
    let query1_results = results;
    console.log('query1_results ', query1_results);
    if(err)
    {
      console.log(err);
      res.sendStatus(400);
    }
    else if(query1_results.length == 0) // name and donation ID did not match
    {      
      let query2 = 'SELECT supply_id, supply_name, total_quantity_needed, quantity_still_needed\
      FROM Supplies ORDER BY supply_name;';
      db.pool.query(query2, (err, results, field) => {
        let query2_results = results;
        let data = {};        
        console.log('no results - id does not match fname and lname');
        data.msg = 'Your name and donation ID do not match. Please try again.';
        data.supplies = query2_results; // an array of rows from Supplies table
        res.render('updateDonation', data); // data includes error msg
      });
    }
    else // name and donation id match
    {
      console.log('we have a match - correct id is found with fname and lname');
      let donation = query1_results[0];
      console.log('query1_results ', donation);
      let old_supply_id = donation.supply_id;
      console.log('old_supply_id ', old_supply_id);    
      let new_supply_id = parseInt(req.body.supply_id);
      console.log('new_supply_id ', new_supply_id);   
      // decrement quantity_still_needed of new supply_id
      let query3 = `Update Supplies SET quantity_still_needed = quantity_still_needed - 1\
          WHERE supply_id = "${new_supply_id}";` ;
      db.pool.query(query3, (err, results, fields) => {
        if(err)
        {
          console.log(err);
          res.sendStatus(400);
        }
        else
        {
          // increment quantity_still_needed of old supply_id
          console.log('inside query4')
          let query4 = `Update Supplies SET quantity_still_needed = quantity_still_needed + 1\
          WHERE supply_id = "${old_supply_id}";`;
          db.pool.query(query4, (err, rows, fields) => {
            if(err)
            {
              console.log(err);
              res.sendStatus(400);
            }
            else
            {
              // update donation with donation_id
              console.log('inside query5')
              let query5 = `Update Donations SET supply_id = ${new_supply_id} WHERE donation_id = ${donation.donation_id};`
              console.log('query5 ', query5);
              db.pool.query(query5, (err, results, fields) => {
                if(err)
                {
                  console.log(err);
                  res.sendStatus(400);
                }
                else
                {
                  // get supplies for dynamically populated supply dropdown list
                  let query6 = `SELECT supply_name FROM Supplies WHERE supply_id = ${new_supply_id};`;
                  console.log('query6 ', query6);
                  db.pool.query(query6, (err, results, fields) => {
                    if(err)
                    {
                      console.log(err);
                      res.sendStatus(400);
                    }
                    else
                    {    
                      if(teacherView=='1') // if teacher submitted
                      {
                        res.redirect('/donors'); 
                      }
                      else // if student submitted
                      {
                        let data = {};
                        data.supply_name = results[0].supply_name;
                        data.email = donation.donor_email;
                        data.fname = donation.donor_fname;
                        data.lname = donation.donor_lname;
                        data.donation_id = donation.donation_id;
                        // send confirmation email using Scott's microservice
                        const item = {
                          "emailTo": data.email,
                          "email": "fisheali@oregonstate.edu",
                          "name": data.fname ,
                          "message": `Thank you for your donation! Please remember to bring your donated supply, ${data.supply_name} to class.\
                          <br>If you made an error in selecting a supply item donation, you can update or delete your donation form on the Donation website.\
                          <br>You will need this unique donation id as a reference: ${data.donation_id}.\
                          <br>Thank you,<br/>Ms. Fisher`,
                          "header": "Confirmation of classroom donation form",
                        };
                        console.log(item);
                        axios
                          .post('https://floating-shelf-48098.herokuapp.com/schoolsupplies', item
                          )
                          .then(function(response) {
                            console.log(response);
                            res.render('thanks', data);
                          })
                          .catch(function (error) {
                            console.log(error);
                            res.sendStatus(400);
                          });   
                      }
                    }
                  });
                }
              });
            }
          });
        }        
      });
    }
  });
});


// student clicks on delete donation option
app.get('/deleteDonation', (req,res) => {
  res.render('deleteDonation');
})

// student submits delete donation form request
app.post('/deleteDonation', (req,res) => {
  let id = req.body.donation_id;
  let fname = req.body.fname;
  let lname = req.body.lname;
  let query1 = `SELECT donation_id, donor_fname, donor_lname, donor_email, d.supply_id, supply_name\
    FROM Donations AS d JOIN Supplies AS s ON d.supply_id = s.supply_id\
    WHERE donation_id = "${id}" AND donor_fname = "${fname}" AND donor_lname = "${lname}";`;

  // student submits fname, lname and donation ID
  db.pool.query(query1, (err, results, field) => {
    console.log(results);
    let query1_results = results;
    console.log('query1_results ', query1_results);
    if(err)
    {
      console.log(err);
      res.sendStatus(400);
    }
    else if(query1_results.length == 0) // if student submits incorrect name and donation ID combo, error msg displayed
    {
      
        console.log('no results - id does not match fname and lname');
        let data = {};   
        data.msg = 'Your name and donation ID do not match. Please try again.';
     
        res.render('deleteDonation', data);
    }
    else // correct name and donation ID submitted
    {
      console.log('we have a match - correct id is found with fname and lname');
      let donation = query1_results[0];
      console.log('query1_results ', donation);
      // delete donation submission 
      let query2 = `DELETE FROM Donations WHERE donation_id = ${donation.donation_id};` ;
      db.pool.query(query2, (err, results, fields) => {
        if(err)
        {
          console.log(err);
          res.sendStatus(400);
        }
        else  
        {
          // update supply quanity_still_needed by incrementing by 1
          console.log('inside query3')
          let query3 = `Update Supplies SET quantity_still_needed = quantity_still_needed + 1\
          WHERE supply_id = "${donation.supply_id}";`;
          db.pool.query(query3, (err, rows, fields) => {
            if(err)
            {
              console.log(err);
              res.sendStatus(400);
            }
            else
            {
              let data = {};
              data.supply_name = donation.supply_name;
              res.render('deleteConfirmation', data );
            }
          });
        }
      });
    }
  });
});

// teacher access to supplies table
app.get('/supplies', (req,res) => {
  let query1 = 'SELECT supply_id, supply_name, total_quantity_needed, quantity_still_needed FROM Supplies ORDER BY supply_name;';
  db.pool.query(query1, (err, results, field) => {
    let supplies = results;
    res.render('supplies', {supplies});
  });    
});


// teacher submits form to add supply to Supplies table
app.post('/addSupplyForm', (req, res) => {
  console.log(req.body);
  let data = req.body;
  data.total_quantity_needed = parseInt(data.total_quantity_needed);
  console.log(data);
  let query1 = `INSERT INTO Supplies (supply_name, total_quantity_needed, quantity_still_needed) \
    VALUES ("${data.supply_name}", ${data.total_quantity_needed}, ${data.total_quantity_needed});`;
  //let query1 = "INSERT INTO Supplies (supply_name, total_quantity_needed, quantity_still_needed) VALUES ('glue sticks', 10, 10);";

  db.pool.query(query1,  (err, results) => {
    if(err)
    {
      console.log(err);
      res.sendStatus(400);
    }
    else
    {
      console.log('results', results);
      res.redirect('supplies');
    }
  });
});



// teacher deletes supply from supplies table
app.get('/supplies/delete/:id', (req,res) => {
  let supply_id = parseInt(req.params.id);
  query1 = `DELETE FROM Supplies WHERE supply_id = ${supply_id};`;
  db.pool.query(query1, (err, results, field) => {
    if(err)
    {
      console.log(err);
      res.sendStatus(400);
    } 
    else
    {
      res.redirect('/supplies');
    }
  });
});

// teacher click on submit button for supply item in a particular row in supplies table
app.get('/supplies/update/:id', (req,res) => {
  console.log(req.params.id);
  let supply_id = parseInt(req.params.id); // supply_id as int
  console.log(supply_id);
  let query1 = `SELECT supply_id, supply_name, total_quantity_needed, quantity_still_needed\
  FROM Supplies WHERE supply_id = ${supply_id};`;
  db.pool.query(query1, (error, results, fields) => {
    if(error)
    {
      console.log(error);
      res.sendStatus(400);
    }
    else
    {
      console.log('results from query 1: ', results);
      let data = {};
      data.supply = results[0];
      res.render('updateSupplyFromTable', data);  
      
    }
  });
});

// teacher submits update form to update supply
app.post('/supplies/update', (req,res) => {
  let supply_id = req.body.supply_id;
  let supply_name = req.body.supply_name;
  let total_quantity_needed = req.body.total_quantity_needed;
  let quantity_still_needed = req.body.quantity_still_needed;
  let query1 = `Update Supplies SET supply_name="${supply_name}", total_quantity_needed=${total_quantity_needed},\
    quantity_still_needed=${quantity_still_needed} WHERE supply_id=${supply_id};`
  console.log(query1);

  db.pool.query(query1, (err, results, field) => {
    if(err)
    {
      console.log(err);
      res.sendStatus(400);
    }
    else
    {
      res.redirect('/supplies');
    }
  });
});

// teacher access to all donations table
app.get('/donors', (req,res) => {
  // access and query database - SELECT class_period, first_name, last_name, supply
  // sort by period, then by last name
  // convert to array of objects called donors
  let query1 = "SELECT donor_period, donation_id, donor_fname, donor_lname, supply_name FROM\
    Donations JOIN Supplies ON Donations.supply_id = Supplies.supply_id\
    ORDER BY donor_period, donor_lname;";
  db.pool.query(query1, (err, results, field) => {
    console.log('results ', results)

    for(var i=0; i<results.length; i++)
    {
      if(results[i].donor_period === -1)
      {
        results[i].donor_period = 'N/A';
      }

    }
    let data = {};
    data.donors = results;

    res.render('donors', data);
  })
})


// teacher deletes donation from view all donations table
app.get('/donors/delete/:id', (req,res) => {
  // First get supply_id of donation that will be deleted
  let donation_id = parseInt(req.params.id);
  query1 = `SELECT d.supply_id as supply_id FROM Donations AS d\ 
  JOIN Supplies AS s ON d.supply_id = s.supply_id\
  WHERE donation_id = ${donation_id};`;
  console.log('query 1 ', query1);
  db.pool.query(query1, (err, results, field) => {
    if(err)
    {
      console.log(err);
      res.sendStatus(400);
    } 
    else
    {
      console.log('results of query1 ', results);
      // next delete donation submission
      let supply_id = results[0].supply_id;
      let query2 = `DELETE FROM Donations WHERE donation_id = ${donation_id};`;
      console.log('query 2 ', query2);
      db.pool.query(query2, (err, results, fields) => {
        if(err)
        {
          console.log(err);
          res.sendStatus(400);
        }
        else
        {                   
          // last update supply quantity_still_needed by incrementing by 1 
          let query3 = `Update Supplies SET quantity_still_needed = quantity_still_needed + 1\
          WHERE supply_id = "${supply_id}";`;
          console.log('query 3 ', query3);
          db.pool.query(query3, (err, rows, fields) => {
            if(err)
            {
              console.log(err);
              res.sendStatus(400);
            }
            else
            {          
              res.redirect('/donors');
            }
          });
        }
      });      
    }
  });
});

// teacher updates donation from view all donations table
app.get('/donors/update/:id', (req,res) => {
  let id = parseInt(req.params.id); // donation id
  var data = {};
  let query1 = `SELECT donation_id, donor_fname, donor_lname, s.supply_id, supply_name\
   FROM Donations as d JOIN Supplies as s ON s.supply_id = d.supply_id WHERE donation_id = ${id};`;
  let query2 = "SELECT supply_id, supply_name, quantity_still_needed FROM Supplies;";
  db.pool.query(query1, (error, results, fields) => {
    if(error)
    {
      console.log(error);
      res.sendStatus(400);
    }
    else
    {
      console.log('results from query 1: ', results);
      data.donation = results[0];
      db.pool.query(query2, (error, results, fields) => {
        if(error)
        {
          console.log(error);
          res.sendStatus(400);
        }     
        else
        {
          data.supplies = results;
          console.log('data ', data);
          res.render('updateDonationFromTable', data);
        }   
      })
    }
  });

})
// teacher download csv from donors page
// this creates csv file on server 
app.get('/downloadCSV', (req,res) => {
  let query1 = 'Select donor_period, donor_lname, donor_fname, supply_name FROM Donations as d \
  JOIN Supplies as s\
  ON d.supply_id = s.supply_id ORDER BY donor_period, donor_lname;';
  db.pool.query(query1, (error, results, fields) => {
    if(error)
    {
      console.log(error);
      res.sendStatus(400);
    }
    else
    {
      let json = JSON.stringify(results);
      res.redirect('/csvmaker?j=' + json);
    }
  });
});

// microservice

app.get('/csvmaker', (req,res) => {
  // take JSON from req, convert to CSV format, then save it to server disk, res.download([include name of file])
  console.log('in /csvmaker route');
  var jsonstring = req.query.j;
  console.log("jsonstring: ", jsonstring);
  todos = JSON.parse(jsonstring);
  // key in header is j=<json string>
  converter.json2csv(todos, (err, csv) => {
      if (err) {
          throw err;
      }
      // print CSV string
      console.log(csv);

      // write CSV to a file
      fs.writeFileSync('todos.csv', csv);
      console.log('after writing file');
      res.setHeader('Content-disposition', 'attachment; filename=data.csv');
      res.set('Content-type', 'text/csv');
      res.status(200).send(csv);
      
  });  
});


app.use((req,res) => {
  res.status(404).send();
  
});

app.listen(app.get('port'), function(){
    console.log('Express started on http://localhost:' + app.get('port') + '; press Ctrl-C to terminate.');
  });