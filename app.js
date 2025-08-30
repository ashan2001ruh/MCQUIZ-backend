const express = require('express');
const app = express();
const cors = require('cors');
const controller = require('./controllers/controller');
const bodyParser = require('body-parser');
require('dotenv').config(); 

app.use(cors());
app.use(bodyParser.json());
app.use(
    express.urlencoded({
        extended: true,
    })
);
app.use(express.json());

app.post('/api/register', controller.registerUser);

app.post('/api/login', controller.loginUser);

module.exports = app;