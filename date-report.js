#!/usr/bin/env node

const moment = require('moment');
const db = require('./lib/db');
const candidates = ['Elissa Silverman', 'Dionne Bussey-Reeder'];

db
    .select('receipt_date', 'candidate_name')
    .count('* as contributions')
    .sum('amount as amount')
    .from('contributions')
    .innerJoin('committees', 'contributions.committee_name', 'committees.committee_name')
    .whereIn('candidate_name', candidates)
    .groupBy('receipt_date', 'candidate_name')
    .orderBy('receipt_date')
    .orderBy('candidate_name')
    .then(function (rows) {
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
        process.exit();
    });
