#!/usr/bin/env node

var sprintf = require("sprintf-js").sprintf,
    stats = require('stats-lite'),
    _ = require('underscore'),
    db = require('./db'),
    data = {};

db.select('office', 'contributions.committee_name', 'candidate_name',
        db.raw("count(distinct contributor_name || ', ' || contributor_address) as contributors"))
    .count('* as contributions')
    .sum('amount as amount')
    .from('contributions')
    .innerJoin('committees', 'contributions.committee_name', 'committees.committee_name')
//    .where('contributor_type', '<>', 'Candidate')
    .groupBy('office', 'contributions.committee_name', 'candidate_name')
    .orderBy('office')
    .orderBy('candidate_name')
    .then(function (rows) {
        rows.forEach(function (row) {
            row.amountList = [];
            data[row.committee_name] = row;
        });
        getStats();
    });

function getStats() {
    db.select('committee_name', 'contributor_name', 'contributor_address')
        .sum('amount as amount')
        .from('contributions')
//        .where('contributor_type', '<>', 'Candidate')
        .groupBy('committee_name', 'contributor_name', 'contributor_address')
        .then(function (rows) {
            var prevOffice = '';
            rows.forEach(function (row) {
                data[row.committee_name].amountList.push(row.amount);
            });
            console.log('            Office  Candidate                 ' +
                'Contributions  Contributors    Amount       Mean    Median    Min       Max');
            _.each(data, function (c) {
                c.amountList = c.amountList.sort(function (a, b) { return a - b; });
                c.mean = stats.mean(c.amountList);
                c.median = stats.median(c.amountList);
                c.min = c.amountList[0];
                c.max = c.amountList[c.amountList.length - 1];
                console.log(sprintf(
                    '%18s  %-24s %13d  %13d  %11.2f  %7.2f  %7.2f  %7.2f  %8.2f',
                    c.office === prevOffice ? '' : c.office,
                    c.candidate_name,
                    c.contributions,
                    c.contributors,
                    c.amount,
                    c.mean,
                    c.median,
                    c.min,
                    c.max
                ));
                prevOffice = c.office;
            });
        });
}