var csv = require('csv'),
    _ = require('underscore'),
    async = require('async'),
    mysql = require('mysql'),
    moment = require('moment'),
    csvOptions = {columns: true},
    config = require('./config'),
    db = mysql.createConnection(config.database),
    queue = async.queue(insertRecord);

db.connect(function (err) {
    if (err) {
        throw err;
    }
});

queue.drain = function () {
    console.log('all records inserted');
    db.end(function (err) {
        if (err) {
            throw err;
        }
        console.log('db connection closed');
    });
};

csv()
    .from.path(__dirname + '/contributions.csv', csvOptions)
    .transform(function (row) {
        var newRow = {};
        _.each(row, function (value, key) {
            newRow[nameToCode(key)] = trim(value);
        });
        newRow.date_of_receipt =
            moment(newRow.date_of_receipt).format('YYYY-MM-DD');
        newRow.amount = newRow.amount.replace(/[$,]/g, '');
        return newRow;
    })
    .on('record', function (row, index) {
        queue.push(row, function (err) {
            if (err) {
                throw err;
            }
        });
    })
    .on('close', function (count) {
        console.log('Total: ', count);
    })
    .on('error', function (err) {
        throw err;
    });

function insertRecord(row, callback) {
    db.query('INSERT INTO contributions SET ?', [row], callback);
}

function nameToCode(s) {
    if (s == null) {
        return null;
    }
    return s.toLowerCase()
        .replace(/\W+/g, '_')
        .replace(/^_|_$/g, '');
}

function trim(s) {
    if (s == null) {
        return null;
    }
    return s.replace(/\s+/g, ' ')
        .replace(/^ | $/g, '');
}
