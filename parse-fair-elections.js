#!/usr/bin/env node

const util = require('util');
const tabula = require('tabula-js');
const pdfToText = util.promisify(require('pdf-to-text').pdfToText);
const csvParse = require('csv-parse/lib/sync');
const camelCase = require('camelcase');
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
    const pagesForSection = await getPagesForSections();
    for (const [title, pages] of Object.entries(pagesForSection)) {
        console.log(pages);
        const data = await getSectionData(pages);
        //console.log(data);
        return
    }
}

async function getSectionData(pageRange) {
    return new Promise(function (resolve, reject) {
        const data = [];
        const stream = tabula(
            inputFile,
            {
                guess: true,
                debug: true,
                noSpreadsheet: true,
                pages: pageRange.join('-'),
            }
        ).streamCsv();
        let columnNames;
        let prevValues;
        stream
            .split()
            .doto(function (line) {
                let values = csvParse(line)[0] || [];
                console.log(values)
                if (values[0] === '' && prevValues) {
                    values = combineValueLists(prevValues, values);
                    data.pop();
                }
                prevValues = values;
                if (!columnNames) {
                    columnNames = values.map(camelCase);
                    return;
                }
                const record = _.object(columnNames, values);
                data.push(record);
            })
            .done(() => resolve(data));
    });
}

function combineValueLists(...lists) {
    const newRecord = [];
    const length = lists[0].length;
    for (let i = 0; i < length; i++) {
        newRecord.push(
            lists.map(list => list[i])
                .filter(v => v !== '' && v != null)
                .join(' ')
        );
    }
    return newRecord;
}

async function getPagesForSections() {
    const pdfText = await pdfToText(inputFile);
    const pagesForSections = {};
    let pageNumber = 2;
    for (const pageContent of pdfText.split('\f').splice(2)) { // skip pages 1 and 2
        pageNumber++;
        if (!/\S/.test(pageContent)) {
            // Skip blank pages
            continue;
        }
        const m = pageContent.match(/(SCHEDULE \S+)\s+(.+)/);
        if (!m) {
            console.error(pageContent);
            throw new Error(`Unexpected content on page ${pageNumber}`);
        }
        const section = m[1] + ': ' + m[2];
        if (!pagesForSections[section]) {
            pagesForSections[section] = [pageNumber, pageNumber];
        }
        else {
            pagesForSections[section][1] = pageNumber;
        }
    }
    return pagesForSections;
}
