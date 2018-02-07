#!/usr/bin/env node

var vsprintf = require("sprintf-js").vsprintf,
    stats = require('stats-lite'),
    _ = require('underscore'),
    db = require('./db'),
    data = {},
    contributorTypes;

db.select(
        'office',
        'contributions.committee_name',
        'candidate_name',
        db.raw("sum(case when contributor_state = 'DC' then amount else 0 end) as dc_amount"),
        db.raw("sum(case when contributor_type in ('Individual', 'Candidate') then amount else 0 end) as ind_amount"),
        db.raw("sum(case when contributor_state = 'DC' and contributor_type in ('Individual', 'Candidate') then amount else 0 end) as dc_ind_amount")
    )
    .count('* as contributions')
    .sum('amount as amount')
    .from('contributions')
    .innerJoin('committees', 'contributions.committee_name', 'committees.committee_name')
    .groupBy('office', 'contributions.committee_name', 'candidate_name')
    .orderBy('office')
    .orderBy('candidate_name')
    .then(function (rows) {
        rows.forEach(function (row) {
            console.log(row.committee_name);
            row.amountList = [];
            row.amountByType = {};
            data[row.committee_name] = row;
        });
        getStats();
    });

function getStats() {
    getContributorTypes()
        .then(function () {
            db.select('committee_name', 'normalized')
                .sum('amount as subtotal')
                .from('contributions')
                .groupBy('committee_name', 'normalized')
                .having('subtotal', '>', 0)
                .then(function (rows) {
                    var prevOffice = '',
                        headers = 'Candidate         ' +
                            'Contributions  Contributors       Amount     Mean   Median  %Ind %DC %DCInd',
                        format = '%-20s %10d %13d  %11.2f  %7.2f  %7.2f  %4.0f %3.0f %6.0f';
                    console.log(headers);
                    rows.forEach(function (row) {
                        data[row.committee_name].amountList.push(row.subtotal);
                    });
                    _.each(data, function (c) {
                        var values = [
                                c.candidate_name,
                                c.contributions,
                                c.amountList.length,
                                c.amount
                            ];
                        c.amountList = c.amountList.sort(function (a, b) { return a - b; });
                        values.push(
                            stats.mean(c.amountList),
                            stats.median(c.amountList),
                            100 * c.ind_amount / c.amount,
                            100 * c.dc_amount / c.amount,
                            100 * c.dc_ind_amount / c.amount,
                            //c.amountList[0],
                            //c.amountList[c.amountList.length - 1]
                        );
                        if (c.office !== prevOffice) {
                            console.log(c.office.toUpperCase());
                        }
                        console.log(vsprintf(format, values));
                        prevOffice = c.office;
                    });
                });
        });
}

function getContributorTypes() {
    return db.distinct('contributor_type')
        .from('contributions')
        .orderBy('contributor_type')
        .then(function (rows) {
            contributorTypes = _.pluck(rows, 'contributor_type');
            console.log(contributorTypes);
            return db.select('committee_name', 'contributor_type')
                .sum('amount as amount')
                .from('contributions')
                .groupBy('committee_name', 'contributor_type')
                .then(function (rows) {
                    rows.forEach(function (c) {
                        data[c.committee_name].amountByType[c.contributor_type] = c.amount;
                    });
                });
        });
}
