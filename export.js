#!/usr/bin/env node

const stringify = require('csv-stringify');
const moment = require('moment');
const db = require('./lib/db');

db
    .select(
        'con.committee_name',
        'con.contributor_first_name',
        'con.contributor_middle_name',
        'con.contributor_last_name',
        'con.contributor_organization_name',
        'con.number_and_street',
        'con.city',
        'con.state',
        'con.zip',
        'con.contributor_type',
        'con.contribution_type',
        'con.employer_name',
        'con.employer_address',
        'con.occupation',
        'con.receipt_date',
        'con.amount',
        'con.normalized',
        'com.candidate_name',
        'com.candidate_short_name',
        'com.election_year',
        'com.office',
)
    .from('contributions AS con')
    .join('committees AS com', 'con.committee_name', 'com.committee_name')
    .join('committee_extras AS ce', 'ce.committee_name', 'com.committee_name')
    .orderBy('con.committee_name')
    .orderBy('con.contributor_last_name')
    .orderBy('con.contributor_first_name')
    .orderBy('con.contributor_middle_name')
    .orderBy('con.number_and_street')
    .orderBy('con.receipt_date')
    .where('ce.is_fair_elections', 1)

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
        for (const row of rows) {
            row.receipt_date = moment(row.receipt_date).format('M/D/YYYY');
        }
        const stringifier = stringify(rows, {header: true});
        stringifier.on('readable', function () {
            let data = '';
            let row;
            while ((row = stringifier.read())) {
                data += row;
            }
            process.stdout.write(data);
        });
        stringifier.on('error', function (err) {
            console.error(err.message);
            throw err;
        });
        stringifier.on('finish', function () {
            // console.log('Finished writing ' + outfile);
            process.exit();
        });
    });
