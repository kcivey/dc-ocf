#!/usr/bin/env node

var fs = require('fs'),
    stringify = require('csv-stringify'),
    moment = require('moment'),
    db = require('./db');

db.select()
    .from('contributions')
    .orderBy('committee_name')
    .orderBy('contributor_name')
    .orderBy('receipt_date')
    /*
    .whereIn('committee_name', [
        'Boese 2018',
        'Brianne for DC 2018',
        'Committee to Elect Lori Parker',
        'Friends of Jamie Sycamore',
        'Reid 4 Ward 1 2018'
    ])
    */
    .then(function (rows) {
        rows.forEach(function (row) {
            row.receipt_date = moment(row.receipt_date).format('M/D/YYYY');
        });
        var stringifier = stringify(rows, {header: true});
        stringifier.on('readable', function(){
            var data = '',
                row;
            while(row = stringifier.read()){
                data += row;
            }
            process.stdout.write(data);
        });
        stringifier.on('error', function (err){
            console.error(err.message);
            throw err;
        });
        stringifier.on('finish', function(){
//            console.log('Finished writing ' + outfile);
        });
    });
