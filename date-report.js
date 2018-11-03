#!/usr/bin/env node

var moment = require('moment'),
    db = require('./db'),
    candidates = ['Elissa Silverman', 'Dionne Bussey-Reeder'];

db.select('receipt_date', 'candidate_name')
    .count('* as contributions')
    .sum('amount as amount')
    .from('contributions')
    .innerJoin('committees', 'contributions.committee_name', 'committees.committee_name')
    .whereIn('candidate_name', candidates)
    .groupBy('receipt_date', 'candidate_name')
    .orderBy('receipt_date')
    .orderBy('candidate_name')
    .then(function (rows) {
        var data = [],
            cursorDate = moment(rows[0].receipt_date),
            endDate = moment(rows[rows.length - 1].receipt_date),
            prevLineData = [''].concat(candidates.map(function () { return 0; }));
        rows.forEach(function (row) {
            var values = [];
            if (!data[row.receipt_date]) {
                data[row.receipt_date] = {};
            }
            data[row.receipt_date][row.candidate_name] = row.amount;
        });
        console.log(['Date'].concat(candidates).join('\t'));
        while (cursorDate <= endDate) {
            var isoDate = cursorDate.format('YYYY-MM-DD'),
                lineData = [cursorDate.format('M/D/YYYY')].concat(
                    candidates.map(function (candidate, i) {
                        return ((+(data[isoDate] && data[isoDate][candidate]) || 0) + +prevLineData[i + 1]).toFixed(2);
                    })
                );
            console.log(lineData.join('\t'));
            prevLineData = lineData;
            cursorDate.add(1, 'day');
        }
        process.exit();
    });
