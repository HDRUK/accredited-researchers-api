var csv = require("csvtojson");
var fs = require("fs");
const sqlite3 = require('sqlite3').verbose();


/**
 * Define some constants, most likely move these to secrets.
 * CSV needs to be readable
 * DB needs to read/writable
 */
var csvFilePath = './path/to/file.csv';
var dbPath = '/path/to/db/latest.db';



/**
 * Check if the DB exists
 */
try {
    if(fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath)
    }
} catch(err) {
    throw err
}



/**
 * Connect to the database
 */
let db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        throw err.message
    }
    console.log('Connected to the database.');
});



/**
 * Create the table here - Assumes column names from CSV spreadsheet
 */
db.run('CREATE TABLE IF NOT EXISTS accredited_users'
 + 'id integer primary key'
 + 'forename TEXT'
 + 'surname TEXT'
 + 'organisation_id TEXT'
 + 'organisation_name TEXT'
 + 'accreditation_number INTEGER'
 + 'type TEXT'
 + 'expiry_date TEXT'
 + 'stage TEXT', [], function(err){
    if (err) {
        throw err.message;
    }

    console.log("DB table created");
});




// We'll read the CSV into the DB
csv().fromFile(csvFilePath).then(function(jsonOutput){
    jsonOutput.forEach(function(row){
        db.run(`INSERT INTO accredited_users(id,forename,surname,organisation_id,organisation_name,accreditation_number,type,expiry_date,stage) VALUES(?,?,?,?,?,?,?,?,?)`, row, function(err) {
            if (err) {
                return console.log(err.message);
            }
            
            // get the last insert id
            console.log(`A row has been inserted with rowid ${this.lastID}`);
        });
    })
});









/**
 * Close the DB connection
 */
db.close((err) => {
    if (err) {
        throw err.message;
    }
    console.log('Close the database connection.');
});