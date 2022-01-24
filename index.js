var express = require('express');
var app = express();
var moment = require('moment');
var Validator = require('jsonschema').Validator;
const sqlite3 = require('sqlite3').verbose();

// set the app to use express json format
app.use(express.json());



/**
 * Recomendations:
 * 
 * Authentication:
 * - https://www.npmjs.com/package/express-bearer-token
 * - https://github.com/oauthjs/node-oauth2-server
 * 
 * SQL Usage:
 * We would recommend an ORM package to interface with the databsase to reduce the risk of SQL injection attacks
 * - https://github.com/prisma/prisma
 * 
 * 
 */



/**
 * Rate limiting for API requests (if required)
 * https://www.npmjs.com/package/express-rate-limit
 */
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 100,                   // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true,      // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false,       // Disable the `X-RateLimit-*` headers
})

// Apply the rate limiting middleware to all requests
app.use(limiter)



// Define how we're going to connect to the data source for querying on demand
var data_source = 'sql';
// var data_source = 'mongodb';
// var data_source = 'csv';
var dbPath = './db/latest.db';


if(data_source === 'sql'){
    /**
     * See recomendations section RE sql injection
     */
    // Connect the SQL Database
    var mysql = require('mysql');

    /**
     * Connection URI. Update host, user, password, database to reflect your cluster. 
     * Strongly recommend using secret stores!
     */
    var con = mysql.createConnection({
        host: "localhost",
        user: "yourusername",
        password: "yourpassword",
        database: "yourdatabase"
    });
    
    con.connect(function(err) {
        if (err) {
            throw err;
        }
        console.log("Connected to DB");
    });
} else if(data_source === 'csv'){
    
    /**
     * We'll assume here that the CSV has been imported into the SQLite database by the import script above
     * 
     * Connect to the database in readonly mode
     */
    var db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            throw err.message
        }
        console.log('Connected to the SQLite database.');
    });

} else if(data_source === 'mongodb'){
    const {MongoClient} = require('mongodb');

    /**
     * Connection URI. Update <username>, <password>, and <your-cluster-url> to reflect your cluster.
     * Strongly recommend using secret stores!
     */
    const uri = "mongodb+srv://<username>:<password>@<your-cluster-url>/test?retryWrites=true&w=majority";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        await listDatabases(client);
    } catch(e){
        console.error(e);
    } finally {
        await client.close();
    }
} else {
    throw new Error('Unrecognised connection type');
}




// Endpoint to list out the fields from the DB
app.get('/list-researchers', function(req, res){
    /**
     * Handle the limit and the skip query params which we will
     * now call offset to simplify SQL terms
     */
    let limit, offset = null;
    if('limit' in req.query){
        limit = parseInt(req.query.limit);
    }
    if('skip' in req.query){
        offset = parseInt(req.query.skip);
    }


    if(data_source === 'sql'){
        let sql = "SELECT id AS 'Researcher ID', forename, surname, organisation_id, organisation_name, accreditation_number, `type`, expiry_date, `stage`  FROM `accredited_users`";
        if(isNaN(limit)) {
            sql+=' LIMIT '+con.escape(limit);
            if(isNaN(offset)){
                sql+=", "+con.escape(offset);
            }
        }

        // Execute the query
        con.query(sql, function (err, rows, fields) {
            if (err) {
                throw err.message;
            }

            // Just read and output
            res.statusCode = 200;
            res.json({
                count: rows.length,
                items: rows
            });
        });
    } else if(data_source === 'csv'){
        let sql = "SELECT id AS 'Researcher ID', forename, surname, organisation_id, organisation_name, accreditation_number, `type`, expiry_date, `stage`  FROM `accredited_users`";
        let params = [];
        if(isNaN(limit)) {
            sql+=' LIMIT ?';
            params.push(limit);
            if(isNaN(offset)){
                sql+=", ?";
                params.push(offset);
            }
        }


        // Execute the query
        db.all(sql, params, function(err, rows){
            if(err){
                throw err.message;
            }

            // Just read and output
            res.statusCode = 200;
            res.json({
                count: rows.length,
                items: rows
            });
        });
    } else {
        // Mongodb -- TODO
    }
})



// Get a researcher by acc
app.get('/researcher/:id', function(req, res){
    if(data_source === 'sql'){
        // Assumed column names and the table name here
        let sql = 'SELECT researcher_id,first_name,last_name,organisation_id,organisation_name,accreditation_number,accreditation_type,expiry_date,is_public,application_stage'
        + 'FROM `accredited_users` '
        + 'WHERE `accreditation_number`='+con.escape(req.params.id);

        let results;
        con.query(sql, function (error, rows, fields) {
            if (error) {
                throw error;
            }

            // results is now set with the user information
            results = rows;
        });

    } else if(data_source === 'mongoDB'){
        // MongoDB -- TODO
        let results = [
            {
                researcher_id: "integer",
                first_name: "string",
                last_name: "string",
                organisation_id: "integer",
                organisation_name: "string",
                accreditation_number: "integer",
                accreditation_type: "string",
                expiry_date: "string",
                is_public: "boolean",
                application_stage: "string|integer"
            }
        ];
    } else {
        // Read from SQLite (this)
        let sql = 'SELECT researcher_id,first_name,last_name,organisation_id,organisation_name,accreditation_number,accreditation_type,expiry_date,is_public,application_stage'
        + 'FROM `accredited_users` '
        + 'WHERE `accreditation_number`=?';
        let results;
        db.all(sql, [req.params.id], function(err, rows){
            if (err) {
                throw err.message;
            }
            
            results = rows;
        });
    }

    if(results.length == 0){
        res.statusCode = 204;
        res.json({
            message: 'No user was found for the given ID'
        });
    } else {
        res.statusCode = 200;
        res.json(results[0]);
    }
});




// Define the route
app.post('/check', function(req, res){
    
    /**
     * Here we have assumed that there are some basic checks
     * done uisng forename, surname, and accredicaiton number. 
     * 
     * All of the input options are listed below so any combination
     * of search would work, we have just used this as an example
    {
        accreditation_number: "integer",
        researcher_id: "string",
        first_name: "string",
        last_name: "string",
        email_address: "string",
        organisation_id: "integer",
        organisation_name: "string"
    }
     */
    

    // Set the data into variables here
    let f_name  = req.body.first_name;
    let s_name  = req.body.last_name;
    let acr_num = req.body.accreditation_number;


    /**
     * We'll perform some basic validation here, this is using jsonschema library
     * Json schema specification found here: https://json-schema.org/
     */
    var f_name_valid = new Validator().validate(f_name, {
        "type": "string",
        "minLength": 2
    });

    var s_name_valid = new Validator().validate(s_name, {
        "type": "string",
        "minLength": 2
    });

    var acr_num_valid = new Validator().validate(acr_num, {
        "type": "int",
        "min": 0
    });

    // Handle failures here



    // Handle the query, we're going to set the variable 'results' in the same format to avoid duplicating logic
    if(data_source === 'sql'){
        // Assumed column names and the table name here
        let sql = 'SELECT researcher_id,first_name,last_name,organisation_id,organisation_name,accreditation_number,accreditation_type,expiry_date,is_public,application_stage'
        + 'FROM `accredited_users` '
        + 'WHERE `first_name`='+con.escape(f_name)+' AND `last_name`='+con.escape(s_name)+' AND `accreditation_number`='+con.escape(acr_num);

        let results;
        con.query(sql, function (error, rows, fields) {
            if (error) {
                throw error;
            }

            // results is now set with the user information
            results = rows;
        });

    } else if(data_source === 'mongoDB'){
        // MongoDB -- TODO
        let results = [
            {
                researcher_id: "integer",
                first_name: "string",
                last_name: "string",
                organisation_id: "integer",
                organisation_name: "string",
                accreditation_number: "integer",
                accreditation_type: "string",
                expiry_date: "string",
                is_public: "boolean",
                application_stage: "string|integer"
            }
        ];
    } else {
        // Read from SQLite (this)
        let sql = 'SELECT researcher_id,first_name,last_name,organisation_id,organisation_name,accreditation_number,accreditation_type,expiry_date,is_public,application_stage'
        + 'FROM `accredited_users` '
        + 'WHERE `first_name`=? AND `last_name`=? AND `accreditation_number`=?';
        let results;
        db.all(sql, [f_name, s_name, acr_num], function(err, rows){
            if (err) {
                throw err.message;
            }
            
            results = rows;
        });
    }



    /**
     * Results should now be set with the following format
    [
        {
            researcher_id: "string",
            first_name: "string",
            last_name: "string",
            organisation_id: "integer",
            organisation_name: "string",
            accreditation_number: "integer",
            accreditation_type: "string",
            expiry_date: "string",
            is_public: "boolean",
            application_stage: "string|integer"
        }
    ]
     */
    if(results.length == 0){
        // We didn't find any results so return not found
        res.statusCode = 204;
        res.json({
            message: 'No user was found against the provided information'
        });
    } else if(results.length > 1){
        // We found more than 1 result, handle this
        res.statusCode = 300;
        res.json({
            message: 'Multiple results were found using your search terms. Please provide an accreditation number for accurate results'
        });
    } else {
        // We should only have one row, get the first one and use data going forward
        var data = results[0];

        // lets check to see if the accreditation has expired
        var db_accreditation_expired = moment(data.expiry_date, 'DD/MM/YYYY').isBefore(moment());
        if(db_accreditation_expired === true){

            // The accreditation has expired
            res.statusCode = 204;
            res.json({
                message: 'The user was found in our database how ever their accreditation expired',
                isValid: false,
                details: data
            });
        } else {

            // Accredication has not expired, return success and their expiration date. 
            res.statusCode = 200;
            res.json({
                message: 'The users was found in our database and their accreditation is valid',
                isValid: true,
                details: data
            });
        }
    }
})






// Start the service and listen
var server = app.listen(8081, function () {
    var host = server.address().address
    var port = server.address().port
    console.log("Example app listening at http://%s:%s", host, port)
})
