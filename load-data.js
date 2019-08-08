#!/usr/bin/env node

const fs = require('fs');
const parse = require('csv-parse');
const _ = require('underscore');
const moment = require('moment');
const db = require('./lib/db');
const csvOptions = {columns: true};
const currentCommittees = {};
const batchSize = 10;
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

db.createTables().then(readCommittees);

function readCommittees() {
    const parser = parse(csvOptions);
    const input = fs.createReadStream(__dirname + '/' + db.committeeTableName + '.csv');
    const records = [];
    parser.on('readable', function () {
        let checked = false;
        let record;
        while ((record = parser.read())) {
            record = transformRecord(record);
            if (!checked) {
                if (!arraysAreEqual(db.committeeColumns, Object.keys(record))) {
                    console.warn(db.committeeColumns, Object.keys(record));
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
        db.batchInsertCommittees(records, batchSize)
            .then(readContributions);
    });
    input.pipe(parser);
}

function readContributions() {
    const parser = parse(csvOptions);
    const input = fs.createReadStream(__dirname + '/' + db.contributionTableName + '.csv');
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
                const expected = db.contributionColumns.filter(v => v !== 'normalized');
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
                db.batchInsertContributions(batch, batchSize)
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
            db.batchInsertContributions(batch, batchSize)
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
    const input = fs.createReadStream(__dirname + '/' + db.expenditureTableName + '.csv');
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
                const expected = db.expenditureColumns.filter(v => v !== 'normalized');
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
                db.batchInsertExpenditures(batch, batchSize)
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
            db.batchInsertExpenditures(batch, batchSize)
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
            db.addDummyContributions();
        }
    });
    input.pipe(parser);
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
        .map(c => r[prefix + c])
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
