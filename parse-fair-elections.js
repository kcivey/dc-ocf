#!/usr/bin/env node

const {pdfToText} = require('pdf-to-text');
const underscored = require('underscore.string/underscored');
const db = require('./lib/db');
const {fixAmount, fixDate, normalizeNameAndAddress} = require('./lib/util');
const inputFile = process.argv[2];

if (!inputFile) {
    console.error('Input filename must be provided');
    process.exit();
}

main()
    .then(() => console.warn('Finished'))
    .catch(console.error)
    .finally(() => db.close())
    .finally(() => process.exit());

async function main() {
    for (const inputFile of process.argv.slice(2)) {
        await processFile(inputFile);
    }
    await db.addDummyContributions();
}

async function processFile(inputFile) {
    // await db.createTables();
    const docText = await getPdfText(inputFile);
    const rowsBySchedule = {};
    let prevSchedule;
    let committeeName;
    let lineNumber = 0;
    let pageNumber = 2;
    for (const pageText of docText.split('\f').slice(2)) { // skip pages 1 and 2
        pageNumber++;
        const pageData = parseTable(pageText);
        if (!pageData) {
            continue;
        }
        if (pageNumber !== pageData.page) {
            throw new Error(`Expected page ${pageNumber}, got page ${pageData.page}`);
        }
        committeeName = pageData.committee_name;
        const schedule = pageData.schedule;
        if (schedule >= 'C') {
            continue; // skip later schedules for now
        }
        if (prevSchedule !== schedule) {
            lineNumber = 0;
            rowsBySchedule[schedule] = [];
            prevSchedule = schedule;
        }
        for (const row of pageData.rows) {
            lineNumber++;
            if (lineNumber !== row.line_number) {
                throw new Error(`Expected line ${lineNumber}, got line ${row.line_number}, page ${pageData.page}`);
            }
            delete row.line_number;
            rowsBySchedule[schedule].push(row);
        }
    }
    console.warn(`Deleting records for ${committeeName}`);
    await db.deleteContributions(committeeName);
    await db.deleteExpenditures(committeeName);
    for (const [schedule, rows] of Object.entries(rowsBySchedule)) {
        if (/^A/.test(schedule)) {
            console.warn(`Inserting ${rows.length} contributions`);
            await db.batchInsertContributions(rows);
        }
        else if (/^B/.test(schedule)) {
            console.warn(`Inserting ${rows.length} expenditures`);
            await db.batchInsertExpenditures(rows);
        }
        else {
            throw new Error(`Got schedule ${schedule}`);
        }
    }
}

function getPdfText(inputFile) {
    return new Promise(function (resolve, reject) {
        pdfToText(inputFile, {}, function (err, text) {
            if (err) {
                return reject(err);
            }
            resolve(text);
        });
    });
}

function parseTable(text) {
    let unparsed = text;
    if (!text.match(/\S/)) { // skip blank pages
        return null;
    }
    let m = unparsed.match(/^(\S+) - (\S[^\n]+\S)\s+Page (\d+) of \d+\s+SCHEDULE (\S+)\s+[^\n]+\n+/s);
    if (!m) {
        console.error(unparsed);
        throw new Error('Unexpected header in page');
    }
    unparsed = unparsed.substr(m[0].length);
    const pageData = {
        committee_id: m[1],
        committee_name: m[2],
        page: +m[3],
        schedule: m[4].replace('-', ''),
        rows: [],
    };
    if (pageData.schedule === 'D' || pageData.schedule === 'E') {
        return pageData;
    }
    m = unparsed.match(/^(#.+)\n(?:.*\n)?\n(?=\d)/);
    if (!m) {
        console.error(unparsed);
        throw new Error(`Can't find table head in page ${pageData.page}`);
    }
    const fields = getFields(m[1]);
    unparsed = unparsed.substr(m[0].length);
    while ((m = unparsed.match(/^\d(?:.*\n){3,4}\n?(?=\d|\s+Subtotal)/))) {
        unparsed = unparsed.substr(m[0].length);
        const row = parseRowText(m[0], fields);
        Object.assign(row, {committee_name: pageData.committee_name});
        pageData.rows.push(row);
    }
    if (!unparsed.match(/^\s*Subtotal/)) {
        console.error(unparsed);
        throw new Error('Unexpected format at end of page');
    }
    return pageData;
}

function getFields(line) {
    const fields = {};
    const re = /\S+(?: \S+)*(?: {2,}|$)/y;
    let m;
    let lastKey;
    while ((m = line.match(re))) {
        const key = m[0].match(/^#\s*$/) ? 'line_number' :
            underscored(m[0].replace(/\/.*/, ''));
        // Allow for starting 1 character earluy except for first column
        fields[key] = m.index > 0 ? [m.index - 1, m[0].length] : [0, m[0].length - 1];
        lastKey = key;
    }
    fields[lastKey][1] += 20; // don't cut off value when last column head is short
    return fields;
}

function parseRowText(text, fields) {
    const lines = text.replace(/\s+$/, '').split('\n');
    const row = parseLine(lines[0], fields);
    if (!row['line_number']) {
        console.error(text);
        throw new Error('Missing line number');
    }
    for (const line of lines.slice(1)) {
        const extra = parseLine(line, fields);
        for (const [key, value] of Object.entries(extra)) {
            if (value === '') {
                continue;
            }
            if (key.match(/^(?:address|business|individual)$|_name$/)) {
                const newKey = key === 'address' ? key : key === 'individual' ? 'payee_address' :
                    key.replace(/(?:_name)?$/, '_address');
                if (!row[newKey]) {
                    row[newKey] = value;
                }
                else {
                    row[newKey] += '\n' + value;
                }
            }
            else if (key === 'occupation') {
                if (!row[key]) {
                    row[key] = value;
                }
                else {
                    row[key] += ' ' + value;
                }
            }
            else if (value) {
                console.error(text);
                throw new Error(`Unexpected row format: "${value}" found in ${key} in later line`);
            }
        }
    }
    const scheduleType = fields.receipt_date ? 'A' : 'B';
    return fixRow(row, scheduleType);
}

function fixRow(oldRow, scheduleType) {
    const row = scheduleType === 'A' ? fixContributionRow(oldRow) : fixExpenditureRow(oldRow);
    for (const prefix of ['contributor', 'payee']) {
        const name = row[prefix + '_name'];
        if (name) {
            const nameParts = parseName(name);
            for (const [key, value] of Object.entries(nameParts)) {
                row[prefix + '_' + key + '_name'] = value;
            }
        }
        delete row[prefix + '_name'];
        const address = row[prefix + '_address'];
        if (address) {
            Object.assign(row, parseAddress(address));
        }
        delete row[prefix + '_address'];
    }
    row.amount = fixAmount(row.amount);
    row.normalized = normalizeNameAndAddress(row);
    row.line_number = +row.line_number;
    return row;
}

function fixContributionRow(oldRow) {
    const row = {...oldRow};
    if (row.address) { // unauthorized contribution
        row.contributor_name = row.business;
        delete row.business;
        row.contributor_address = row.address;
        delete row.address;
    }
    else {
        row.employer_address = row.employer_address.replace('\n', ', ')
            .replace(/,\s*/, ', ')
            .replace(/, ([A-Z]{2})-(\d{5}(?:-\d{4})?)$/, ', $1 $2');
        delete row.cumulative_amount;
    }
    row.contributor_organization_name = '';
    row.contribution_type = row.mode_of_payment;
    delete row.mode_of_payment;
    if (row.relationship) {
        // row.contributor_type = row.relationship;
        row.contributor_type = 'Candidate';
        delete row.relationship;
    }
    else {
        row.contributor_type = 'Individual';
    }
    row.receipt_date = fixDate(row.receipt_date);
    return row;
}

function fixExpenditureRow(oldRow) {
    const row = {...oldRow};
    if (row.refund_date) {
        if (row.individual) { // refund of unauthorized contribution
            row.payee_name = row.individual;
            delete row.individual;
        }
        else if (row.contributor_name) {
            row.payee_name = row.contributor_name;
            delete row.contributor_name;
            row.payee_address = row.contributor_address;
            delete row.contributor_address;
        }
        row.purpose_of_expenditure = 'Refund';
        row.payment_date = row.refund_date;
        delete row.refund_date;
        delete row.contribution_date;
        delete row.reason;
        delete row.mode_of_payment;
    }
    else {
        row.payee_name = row.business;
        delete row.business;
        row.payee_address = row.business_address;
        delete row.business_address;
        row.payment_date = row.date;
        delete row.date;
    }
    row.payment_date = fixDate(row.payment_date);
    return row;
}

function parseLine(line, fields) {
    const record = {};
    for (const [name, [start, length]] of Object.entries(fields)) {
        record[name] = line.substr(start, length).trim();
    }
    return record;
}

function parseName(name) {
    const m = name.match(/^(?:(\S+)(?: (.+?))? )?(\S+(?: (?:[JS]r|I+|IV|VI*)\.?)?)$/);
    if (!m) {
        throw new Error(`Unexpected name format "${name}"`);
    }
    return {
        first: m[1] || '',
        middle: m[2] || '',
        last: m[3],
    };
}

function parseAddress(address) {
    const lines = address.trim().split('\n');
    const lastLine = lines.pop();
    const m = lastLine.match(/^(\S.+\S),\s*([A-Z]{2})[- ](\d{5}(?:-\d{4})?)$/);
    if (!m) {
        throw new Error(`Unexpected address format "${address}"`);
    }
    return {
        number_and_street: lines.join(', '),
        city: m[1],
        state: m[2],
        zip: m[3],
    };
}
