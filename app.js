const express = require('express');
const app = express();
const path = require('path');
const db = require('./database/db-connector');
const converter = require('json-2-csv');
const fs = require('fs');

const fakedata = require('./fakedata');

app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
app.use(express.json());

var handlebars = require('express-handlebars').create({defaultLayout:'main'});
app.engine('handlebars', handlebars.engine);

app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));
app.set('port', 8523);

//Create static file references
app.use('/static', express.static('public')); //middleware
app.use(express.static(path.join(__dirname, 'public')));


app.get('/', (req,res) => {
  let query1 = 'SELECT supply_id, supply_name, total_quantity_needed, quantity_still_needed FROM Supplies ORDER BY supply_name;';
  db.pool.query(query1, (err, results, field) => {
    let supplies = results;
    console.log(supplies);
    res.render('home', {supplies});
  });     
});

app.post('/addDonationForm', (req, res) => {
  console.log(req.body);
  let data = req.body;
  data.class_period = parseInt(data.class_period);
  data.supply_id = parseInt(data.supply_id);
  console.log(data);
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
      // send confirmation email to donor
      let query2 = `SELECT supply_name FROM Donations JOIN Supplies ON Donations.supply_id = Supplies.supply_id WHERE donation_id="${donation_id}";`;
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
          console.log('supply_id', data.suppy_id);
          let query3 = `Update Supplies SET quantity_still_needed = quantity_still_needed - 1 WHERE supply_id = "${data.supply_id}";`
          db.pool.query(query3, (err, rows, fields) => {
            if(err)
            {
              console.log(err);
              res.sendStatus(400);
            }
            else
            {
              res.render('thanks', data);
            }
          })            
        }      
      });
    }
  });
});



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

app.get('/donors/delete/:id', (req,res) => {
  let donation_id = parseInt(req.params.id);
  query1 = `DELETE FROM Donations WHERE donation_id = ${donation_id};`;
  db.pool.query(query1, (err, results, field) => {
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

});


app.get('/updateDonation', (req,res) => {
  // query1 to get list of supplies still needed
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
})

app.post('/updateDonation', (req,res) => {  
  let id = req.body.donation_id;
  let fname = req.body.fname;
  let lname = req.body.lname;
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
    else if(query1_results.length == 0)
    {
      let query2 = 'SELECT supply_id, supply_name, total_quantity_needed, quantity_still_needed\
      FROM Supplies ORDER BY supply_name;';
      db.pool.query(query2, (err, results, field) => {
        let query2_results = results;
        let data = {};        
        console.log('no results - id does not match fname and lname');
        data.msg = 'Your name and donation ID do not match. Please try again.';
        data.supplies = query2_results; // an array of rows from Supplies table
        res.render('updateDonation', data);
      });
    }
    else
    {
      console.log('we have a match - correct id is found with fname and lname');
      let donation = query1_results[0];
      console.log('query1_results ', donation);
      let old_supply_id = donation.supply_id;
      console.log('old_supply_id ', old_supply_id);    
      let new_supply_id = parseInt(req.body.supply_id);
      console.log('new_supply_id ', new_supply_id);
      // decrement quantity_still_needed of new supply_id
      // increment quantity_still_needed of old supply_id
      // update donation with donation_id
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
                      // send confirmation email
                      let data = {};
                      data.supply_name = results[0].supply_name;
                      data.email = donation.donor_email;
                      data.fname = donation.donor_fname;
                      data.lname = donation.donor_lname;
                      data.donation_id = donation.donation_id;
                
                      // send confirmation email using Scott's microservice
                      // includes info in data above

                      console.log('data ',data);
                      res.render('thanks', data);
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

app.get('/deleteDonation', (req,res) => {
  res.render('deleteDonation');
})

app.post('/deleteDonation', (req,res) => {
  let id = req.body.donation_id;
  let fname = req.body.fname;
  let lname = req.body.lname;
  let query1 = `SELECT donation_id, donor_fname, donor_lname, donor_email, d.supply_id, supply_name\
    FROM Donations AS d JOIN Supplies AS s ON d.supply_id = s.supply_id\
    WHERE donation_id = "${id}" AND donor_fname = "${fname}" AND donor_lname = "${lname}";`;

  db.pool.query(query1, (err, results, field) => {
    console.log(results);
    let query1_results = results;
    console.log('query1_results ', query1_results);
    if(err)
    {
      console.log(err);
      res.sendStatus(400);
    }
    else if(query1_results.length == 0)
    {
      
        console.log('no results - id does not match fname and lname');
        let data = {};   
        data.msg = 'Your name and donation ID do not match. Please try again.';
     
        res.render('deleteDonation', data);
    }
    else
    {
      console.log('we have a match - correct id is found with fname and lname');
      let donation = query1_results[0];
      console.log('query1_results ', donation);
      let query2 = `DELETE FROM Donations WHERE donation_id = ${donation.donation_id};` ;
      db.pool.query(query2, (err, results, fields) => {
        if(err)
        {
          console.log(err);
          res.sendStatus(400);
        }
        else  
        {
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


app.post('/update', (req,res) => {
/* req.body is data from user form ->
id: 2,
supply: 'scissors'
*/ 
// look up row with ID and update supply in donor database
// In supplies database:
// increment still_needed of old supply
// decrement still_needed of new supply

// send confirmation email with ID, name, supply using microservice


})


app.post('/deleteDonation', (req,res) => {
  /* req.body is data from user form ->
  id: 2
  */ 
  // look up row with ID and update supply in donor database
  // In supplies database: delete row with matching id
  // send confirmation email with name.

  res.redirect('/thanks');
})

app.post('/downloadCSV', (req,res) => {
  // query database,  convert to CSV
  // on donors page as an option for teacher
});

// microservice
app.get('/csvmaker', (req,res) => {
  // take JSON from req, convert to CSV format, then save it to server disk, res.download([include name of file])
  console.log('in /csvmaker route');
  //jsonstring = fakedata.todos; // json array
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