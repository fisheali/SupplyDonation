const supplies = [
    {
      supply: 'scissors',
      quantity: 20,
      still_needed: 15
    },
    {
      supply: 'tissue boxes',
      quantity: 30,
      still_needed: 12
    },
    {
      supply: 'dry erase marker packs',
      quantity:15,
      still_needed:0
    },
    {
      supply: 'reams of paper',
      quantity: 10,
      still_needed: 8
    }
  ];
  
  const donors = [
    {
      id:21,
      class_period: 1,
      first_name: 'Winnie',
      last_name: 'Chuma',
      supply: 'scissors'
    },
    {
      id: 34,
      class_period: 2,
      first_name: 'Dawson',
      last_name: 'Benner',
      supply: 'ream of paper'
    }
  
    
  ];
  
  const todos = [
    {
        "id": 1,
        "title": "delectus aut autem",
        "completed": false
    },
    {
        "id": 2,
        "title": "quis ut nam facilis et officia qui",
        "completed": false
    },
    {
        "id": 3,
        "title": "fugiat veniam minus",
        "completed": false
    }]; 
exports.supplies = supplies;
exports.donors = donors;
exports.todos = todos;