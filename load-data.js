#!/usr/bin/env node

const fs = require('fs');
const parse = require('csv-parse');
const _ = require('underscore');
const moment = require('moment');
const db = require('./lib/db');
const csvOptions = {columns: true};
const currentCommittees = {};
const batchSize = 10;
const committeeTableName = 'committees';
const committeeColumns = [
    'committee_name',
    'candidate_name',
    'election_year',
    'status',
    'office',
];
const contributionTableName = 'contributions';
const contributionColumns = [
    'committee_name',
    'contributor_first_name',
    'contributor_middle_name',
    'contributor_last_name',
    'number_and_street',
    'contributor_organization_name',
    'city',
    'state',
    'zip',
    'normalized',
    'contributor_type',
    'contribution_type',
    'employer_name',
    'employer_address',
    'occupation',
    'receipt_date',
    'amount',
];
const expenditureTableName = 'expenditures';
const expenditureColumns = [
    'committee_name',
    'payee_first_name',
    'payee_middle_name',
    'payee_last_name',
    'number_and_street',
    'city',
    'state',
    'zip',
    'normalized',
    'purpose_of_expenditure',
    'payment_date',
    'amount',
];
const abbrev = {
    STREET: 'ST',
    ROAD: 'RD',
    DRIVE: 'DR',
    AVENUE: 'AVE',
    COURT: 'CT',
    LANE: 'LN',
    TERRACE: 'TER',
    CIRCLE: 'CIR',
    BOULEVARD: 'BLVD',
    HIGHWAY: 'HWY',
    PLACE: 'PL',
};
const abbrevRegexp = new RegExp('\\b(' + Object.keys(abbrev).join('|') + ')\\b');

db.schema.dropTableIfExists(contributionTableName)
    .dropTableIfExists(expenditureTableName)
    .dropTableIfExists(committeeTableName)
    .createTable(
        committeeTableName,
        function (table) {
            table.increments();
            committeeColumns.forEach(function (columnName) {
                if (/year/.test(columnName)) {
                    table.integer(columnName);
                }
                else {
                    table.string(columnName);
                }
            });
        }
    )
    .createTable(
        contributionTableName,
        function (table) {
            table.increments();
            contributionColumns.forEach(function (columnName) {
                if (/date/.test(columnName)) {
                    table.date(columnName);
                }
                else if (/amount|total/.test(columnName)) {
                    table.float(columnName);
                }
                else {
                    table.string(columnName);
                }
            });
        }
    )
    .createTable(
        expenditureTableName,
        function (table) {
            table.increments();
            expenditureColumns.forEach(function (columnName) {
                if (/date/.test(columnName)) {
                    table.date(columnName);
                }
                else if (/amount|total/.test(columnName)) {
                    table.float(columnName);
                }
                else {
                    table.string(columnName);
                }
            });
        }
    )
    .then(readCommittees);

function readCommittees() {
    const parser = parse(csvOptions);
    const input = fs.createReadStream(__dirname + '/' + committeeTableName + '.csv');
    const records = [];
    parser.on('readable', function () {
        let checked = false;
        let record;
        while ((record = parser.read())) {
            record = transformRecord(record);
            if (!checked) {
                if (!arraysAreEqual(committeeColumns, Object.keys(record))) {
                    console.warn(committeeColumns, Object.keys(record));
                    throw new Error('Committee columns have changed');
                }
                checked = true;
            }
            currentCommittees[record.committee_name] = true;
            records.push(record);
        }
    });
    parser.on('error', function (err) {
        console.error(err.message);
        throw err;
    });
    parser.on('finish', function () {
        console.log('Finished reading committees');
        console.log(Object.keys(currentCommittees).sort());
        db.batchInsert(committeeTableName, records, batchSize)
            .returning('id')
            .then(readContributions);
    });
    input.pipe(parser);
}

function readContributions() {
    const parser = parse(csvOptions);
    const input = fs.createReadStream(__dirname + '/' + contributionTableName + '.csv');
    const seen = {};
    const unrecognized = [];
    let totalCount = 0;
    let currentCount = 0;
    let batch = [];
    parser.on('readable', function () {
        let record;
        while ((record = parser.read())) {
            totalCount++;
            record = transformRecord(record);
            if (totalCount === 1) {
                const expected = contributionColumns.filter(v => v !== 'normalized');
                if (!arraysAreEqual(expected, Object.keys(record))) {
                    console.warn(expected, Object.keys(record));
                    throw new Error('Contribution columns have changed');
                }
            }
            const name = record.committee_name;
            if (!seen[name]) {
                seen[name] = true;
                console.log(name);
                if (!currentCommittees[name]) {
                    unrecognized.push(name);
                }
            }
            if (!currentCommittees[name]) {
                continue;
            }
            record.normalized = normalizeNameAndAddress(makeName(record), makeAddress(record));
            batch.push(record);
            if (batch.length >= 10000) {
                db.batchInsert(contributionTableName, batch, batchSize)
                    .then(function () {});
                batch = [];
            }
            currentCount++;
        }
    });
    parser.on('error', function (err) {
        console.error(err.message);
        throw err;
    });
    parser.on('finish', function () {
        if (batch.length) {
            db.batchInsert(contributionTableName, batch, batchSize)
                .then(function () {});
        }
        console.log('Finished reading %d contributions', totalCount);
        console.log('Inserted %d contributions', currentCount);
        console.log('Unrecognized committees:\n', unrecognized.sort());
        readExpenditures();
    });
    input.pipe(parser);
}

function readExpenditures() {
    const parser = parse(csvOptions);
    const input = fs.createReadStream(__dirname + '/' + expenditureTableName + '.csv');
    const seen = {};
    const unrecognized = [];
    let totalCount = 0;
    let currentCount = 0;
    let batch = [];
    parser.on('readable', function () {
        let record;
        while ((record = parser.read())) {
            totalCount++;
            record = transformRecord(record);
            if (totalCount === 1) {
                const expected = expenditureColumns.filter(v => v !== 'normalized');
                if (!arraysAreEqual(expected, Object.keys(record))) {
                    console.warn(expected, Object.keys(record));
                    throw new Error('Expenditure columns have changed');
                }
            }
            const name = record.committee_name;
            if (!seen[name]) {
                seen[name] = true;
                console.log(name);
                if (!currentCommittees[name]) {
                    unrecognized.push(name);
                }
            }
            if (!currentCommittees[name]) {
                continue;
            }
            record.normalized = normalizeNameAndAddress(makeName(record), makeAddress(record));
            batch.push(record);
            if (batch.length >= 10000) {
                db.batchInsert(expenditureTableName, batch, batchSize)
                    .then(function () {});
                batch = [];
            }
            currentCount++;
        }
    });
    parser.on('error', function (err) {
        console.error(err.message);
        throw err;
    });
    parser.on('finish', function () {
        if (batch.length) {
            db.batchInsert(expenditureTableName, batch, batchSize)
                .then(finish);
        }
        else {
            finish();
        }

        function finish() {
            console.log('Finished reading %d expenditures', totalCount);
            console.log('Inserted %d expenditures', currentCount);
            if (unrecognized.length) {
                console.log('Unrecognized committees:\n', unrecognized.sort());
            }
            addDummyContributions();
        }
    });
    input.pipe(parser);
}

// Add negative contributions corresponding to refunds and bounced checks
function addDummyContributions() {
    db
        .select(
            'e.committee_name',
            'e.payee_first_name as contributor_first_name',
            'e.payee_middle_name as contributor_middle_name',
            'e.payee_last_name as contributor_last_name',
            'e.number_and_street',
            'e.city',
            'e.state',
            'e.zip',
            'e.normalized',
            'c.contributor_type',
            'e.purpose_of_expenditure as contribution_type',
            'c.employer_name',
            'c.employer_address',
            'c.occupation',
            'e.payment_date as receipt_date',
            db.raw('-e.amount as amount')
        )
        .from('expenditures as e')
        .innerJoin('contributions as c', function () {
            this.on('e.committee_name', 'c.committee_name')
                .andOn('e.normalized', 'c.normalized');
        })
        .whereIn('purpose_of_expenditure', ['Refund', 'Return Check and Fees'])
        .groupBy('e.id')
        .orderBy('e.committee_name')
        .orderBy('e.payee_last_name')
        .orderBy('e.payee_first_name')
        .orderBy('e.payee_middle_name')
        .then(function (rows) {
            db.batchInsert(contributionTableName, rows, batchSize)
                .then(function () {
                    console.log('Dummy contributions inserted');
                    process.exit();
                });
        });
}

function transformRecord(record) {
    const newRecord = {};
    _.each(record, function (value, key) {
        value = trim(value);
        key = nameToCode(key);
        if (/date/.test(key) && /^\d\d?\/\d\d?\/\d{4}$/.test(value)) {
            value = moment(value, 'MM/DD/YYYY').format('YYYY-MM-DD');
        }
        else if (/amount|total/.test(key) && /^[$.,\d]+$/.test(value)) {
            value = value.replace(/[$,]/g, '');
        }
        newRecord[key] = value;
    });
    return newRecord;
}

function nameToCode(s) {
    return s.toLowerCase()
        .replace(/\W+/g, '_')
        .replace(/^_|_$/g, '');
}

function trim(s) {
    return s ? s.replace(/\s+/g, ' ').replace(/^ | $/g, '') : '';
}

function makeName(r) {
    const prefix = r.hasOwnProperty('contributor_name') ? 'contributor_' : 'payee_';
    return ['first_name', 'middle_name', 'last_name', 'organization_name']
        .map(c => r[prefix+ c])
        .filter(v => !!v)
        .join(' ');
}

function makeAddress(r) {
    let address = r.number_and_street || '';
    if (r.city) {
        if (address) {
            address += ', ';
        }
        address += r.city;
    }
    if (r.state) {
        if (address) {
            address += ', ';
        }
        address += r.state;
    }
    if (r.zip) {
        if (address) {
            address += ' ';
        }
        address += r.zip;
    }
    return address;
}

function normalizeNameAndAddress(name, address) {
    let normalized = name.toUpperCase()
        .replace(/[ ,]*,[ ,]*/g, ' ')
        .replace(/\./g, '')
        .replace(/^(MR|MS|MRS|DR) /, '')
        .replace(/ AND /g, ' & ')
        .replace(/^THE /, '')
        // .replace(/ [A-Z] /g, ' ') // remove middle initials
        // .replace(/ (JR|SR|I{1,3})$/, '')
        .replace(/[\- ]*-[\- ]*/g, ' ');
    if (address) {
        normalized += ', ' + address.toUpperCase()
            .replace(/[ ,]*,[ ,]*/g, ' ')
            .replace(/\./g, '')
            .replace(/'/g, '')
            .replace(/,?\s*([NS][EW],)/, ' $1')
            .replace(/ [\d \-]+$/, '') // remove zip
            .replace(/[\- ]*-[\- ]*/g, ' ')
            .replace(/\b(SUITE|STE|APT|UNIT)[ #]+/, '#')
            .replace(/# /, '#')
            .replace(/ FL(?:OOR)? \d\d?(?:[NR]?D|ST|TH)? /, ' ')
            .replace(/ \d\d?(?:[NR]?D|ST|TH)? FL(?:OOR)? /, ' ')
            .replace(/ VIRGINIA$/, ' VA')
            .replace(/ MARYLAND$/, ' MD')
            .replace(/ DISTRICT OF COLUMBIA$/, ' DC')
            .replace(/ MC LEAN /g, ' MCLEAN ')
            .replace(/( \w+)(\1 [A-Z]{2})$/, '$2')
            .replace(/( \w+ [A-Z]{2})\1$/, '$1')
            .replace(/ #\S+/, '') // remove apartment number
            .replace(abbrevRegexp, (m, p1) => abbrev[p1]);
    }
    return normalized;
}

function arraysAreEqual(array1, array2) {
    return array1.length === array2.length && array1.every((value, index) => value === array2[index]);
}
