#!/usr/bin/env node

const {pdfToText} = require('pdf-to-text');
const underscored = require('underscore.string/underscored');
const _ = require('underscore');
const inputFile = process.argv[2];

if (!inputFile) {
    console.error('Input filename must be provided');
    process.exit();
}

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
        pageData.rows.push(parseRowText(m[0], fields));
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
    while ((m = line.match(re))) {
        const key = m[0].match(/^#\s*$/) ? 'line_number' :
            underscored(m[0].replace(/\/.*/, ''));
        fields[key] = [m.index, m[0].length];
    }
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
            if (key.match(/^business$|_name$/)) {
                const newKey = key.replace(/(?:_name)?$/, '_address');
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
    return row;
}

function parseLine(text, fields) {
    const record = {};
    for (const [name, [start, length]] of Object.entries(fields)) {
        record[name] = text.substr(start, length).trim();
    }
    return record;
}
