// Import Express.js
const express = require('express');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const mysql = require('mysql2/promise');

const host = process.env.HOST_DATABASE;
const user = process.env.USER_DATABASE;
const db = process.env.NAME_DATABASE;
const pwd  = process.env.PWD_DATABASE;
const axios = require('axios');

//const connection = mysql.createConnection({
const pool = mysql.createPool({
  host: host,
  user: user,
  password: pwd,
  database: db // Optional: specify a database to connect to directly
});

/*console.log( connection );
async function connectMysql () {
await is    connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return false;
  } else {
      console.log('Connected to MySQL database!');
      return true;
  }
})
}*/

// Route for GET requests
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Route for POST requests
app.post('/', (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));
  
        pool.execute( "INSERT INTO message_received ( message ) VALUES ( ? )", JSON.stringify(req.body, null, 2) )
            .then( ([results]) => { 
                console.log( `Ok ${results.insertId} ` ) ;
      }).catch (error  =>{
        console.log(error);
      })
    
  res.status(200).end();
});

app.post( '/message', (req, res) => {
const datasend =  {
        messaging_product:"whatsapp",
        to: "5519982292047",
        type:"template",
        template: { 
            name: "hello_world", 
            language: { 
                code:"en_US" 
            } 
        }};

axios.post('https://graph.facebook.com/v22.0/778752671981810/messages', datasend, {
    headers: {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${verifyToken}`
        }
    }).then(response => {
            console.log('Data submitted:', response.data);
        })
        .catch(error => {
            console.error('Error submitting data:', error);
        });
});
// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});
