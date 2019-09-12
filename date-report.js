#!/usr/bin/env node

const moment = require('moment');
const argv = require('yargs')
    .options({
        office: {
            type: 'string',
            describe: 'include only offices that match string',
            required: true,
            requiredArg: true,
        },
        state: {
            type: 'string',
            describe: 'include only contributions from specified state (usually DC)',
            requiredArg: true,
        },
        ward: {
            type: 'number',
            describe: 'include only contributions from specified DC ward',
            requiredArg: true,
        },
        amount: {
            type: 'boolean',
            describe: 'report amount of money instead of number of contributors',
        },
    })
    .strict(true)
    .argv;
const db = require('./lib/db');
const useAmount = argv.amount;
const filters = {...argv};
delete filters.amount;

main()
    .catch(console.error)
    .finally(() => db.close());

async function main() {
    const candidates = await db.getCandidatesForOffice(argv.office);
    const rows = await db.getContributorsByDate(filters, useAmount);
    const data = {};
    const cursorDate = moment(rows[0].receipt_date);
    const endDate = moment(rows[rows.length - 1].receipt_date);
    let prevLineData = [''].concat(candidates.map(() => 0));
    for (const row of rows) {
        if (!data[row.receipt_date]) {
            data[row.receipt_date] = {};
        }
        data[row.receipt_date][row.candidate_short_name] = useAmount ? row.amount : row.contributors;
    }
    console.log(['Date'].concat(candidates).join('\t'));
    while (cursorDate <= endDate) { // eslint-disable-line no-unmodified-loop-condition
        const isoDate = cursorDate.format('YYYY-MM-DD');
        const lineData = [cursorDate.format('M/D/YYYY')].concat(
            candidates.map(function (candidate, i) { // eslint-disable-line no-loop-func
                const n = (+(data[isoDate] && data[isoDate][candidate]) || 0) + +prevLineData[i + 1];
                return argv.amount ? n.toFixed(2) : n;
            })
        );
        console.log(lineData.join('\t'));
        prevLineData = lineData;
        cursorDate.add(1, 'day');
    }
}
