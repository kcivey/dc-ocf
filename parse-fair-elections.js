#!/usr/bin/env node

const {pdfToText} = require('pdf-to-text');
const csvParse = require('csv-parse/lib/sync');
const camelCase = require('camelcase');
const _ = require('underscore');
const inputFile = process.argv[2];

if (!inputFile) {
    console.error('Input filename must be provided');
    process.exit();
}

const fields = {
    lineNumber: [0, 7],
    contributor_name: [7, 42],
    occupation: [49, 22],
    employer_name: [71, 41],
    mode_of_payment: [112, 24],
    receipt_date: [136, 38],
    amount: [174, 10],
    cumulative_amount: [184, 20],
};

main()
    .then(console.log)
    .catch(console.error);

async function main() {
    const docText = await getPdfText();
    for (const pageText of docText.split('\f').slice(2)) { // skip pages 1 and 2
        const pageData = parseTable(pageText);
        console.log(pageData)
    }
}

function getPdfText() {
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
    let m = text.match(/^.*Page (\d+) of \d+\s+SCHEDULE (\S+)\s+[^\n]+\s+(?=#)/s);
    if (!m) {
        console.error(text);
        throw new Error('Unexpected page format');
    }
    text = text.substr(m[0].length);
    const pageData = {
        page: m[1],
        schedule: m[2].replace('-', ''),
        rows: [],
    };
    while ((m = text.match(/^(?:.*\n){3}\n?(?=\d|\s+Subtotal)/))) {
        text = text.substr(m[0].length);
        pageData.rows.push(parseRowText(m[0]));
    }
    if (!text.match(/^\s*Subtotal/)) {
        console.error(text);
        throw new Error('Unexpected format at end of page');
    }
    return pageData;
}

function parseRowText(text) {
    const lines = text.replace(/\s+$/, '').split('\n');
    const row = parseLine(lines[0]);
    console.warn(row)
    for (const line of lines.slice(1)) {
        const extra = parseLine(line);
        console.warn(extra)
        for (const [key, value] of Object.entries(extra)) {
            if (key.match(/_name$/)) {
                const newKey = key.replace(/_name$/, '_address');
                if (!row[newKey]) {
                    row[newKey] = value;
                }
                else {
                    row[newKey] += '\n' + value;
                }
            }
            else if (value !== '') {
                console.error(text);
                throw new Error(`Unexpected row format: "${value}" found in ${key} in later line`);
            }
        }
    }
    return row;
}

function parseLine(text) {
    const record = {};
    for (const [name, [start, length]] of Object.entries(fields)) {
        record[name] = text.substr(start, length).trim();
    }
    return record;
}
