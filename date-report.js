#!/usr/bin/env node

const moment = require('moment');
const argv = require('yargs')
    .options({
        office: {
            type: 'string',
            describe: 'include only offices that match string',
            required: true,
        },
    })
    .strict(true)
    .argv;
const db = require('./lib/db');
const office = argv.office;

main()
    .catch(console.error)
    .finally(() => db.close());

async function main() {
    const candidates = await db.getCandidatesForOffice(office);
    const rows = await db.getContributionsByDate({office});
    const data = [];
    const cursorDate = moment(rows[0].receipt_date);
    const endDate = moment(rows[rows.length - 1].receipt_date);
    let prevLineData = [''].concat(candidates.map(() => 0));
    for (const row of rows) {
        if (!data[row.receipt_date]) {
            data[row.receipt_date] = {};
        }
        data[row.receipt_date][row.candidate_name] = row.amount;
    }
    console.log(['Date'].concat(candidates).join('\t'));
    while (cursorDate <= endDate) {
        const isoDate = cursorDate.format('YYYY-MM-DD');
        const lineData = [cursorDate.format('M/D/YYYY')].concat(
            candidates.map(function (candidate, i) {
                return ((+(data[isoDate] && data[isoDate][candidate]) || 0) +
                    +prevLineData[i + 1]).toFixed(2);
            })
        );
        console.log(lineData.join('\t'));
        prevLineData = lineData;
        cursorDate.add(1, 'day');
    }
}
