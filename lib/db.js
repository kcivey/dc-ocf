const path = require('path');
const _ = require('underscore');
const db = require('knex')(
    {
        client: 'sqlite3',
        connection: {
            filename: path.dirname(__dirname) + '/dc-ocf.sqlite',
        },
        useNullAsDefault: true,
    }
);
const committeeTableName = 'committees';
const committeeColumns = [
    'committee_name',
    'candidate_name',
    'election_year',
    'status',
    'office',
];
const contributionTableName = 'contributions';
const contributionColumns = [
    'committee_name',
    'contributor_first_name',
    'contributor_middle_name',
    'contributor_last_name',
    'number_and_street',
    'contributor_organization_name',
    'city',
    'state',
    'zip',
    'normalized',
    'contributor_type',
    'contribution_type',
    'employer_name',
    'employer_address',
    'occupation',
    'receipt_date',
    'amount',
];
const expenditureTableName = 'expenditures';
const expenditureColumns = [
    'committee_name',
    'payee_first_name',
    'payee_middle_name',
    'payee_last_name',
    'number_and_street',
    'city',
    'state',
    'zip',
    'normalized',
    'purpose_of_expenditure',
    'payment_date',
    'amount',
];
const defaultBatchSize = 25;

function createTables() {
    return db.schema.dropTableIfExists(contributionTableName)
        .dropTableIfExists(expenditureTableName)
        .dropTableIfExists(committeeTableName)
        .createTable(
            committeeTableName,
            function (table) {
                table.increments();
                committeeColumns.forEach(function (columnName) {
                    if (/year/.test(columnName)) {
                        table.integer(columnName);
                    }
                    else {
                        table.string(columnName);
                    }
                });
            }
        )
        .createTable(
            contributionTableName,
            function (table) {
                table.increments();
                contributionColumns.forEach(function (columnName) {
                    if (/date/.test(columnName)) {
                        table.date(columnName);
                    }
                    else if (/amount|total/.test(columnName)) {
                        table.float(columnName);
                    }
                    else {
                        table.string(columnName);
                    }
                });
            }
        )
        .createTable(
            expenditureTableName,
            function (table) {
                table.increments();
                expenditureColumns.forEach(function (columnName) {
                    if (/date/.test(columnName)) {
                        table.date(columnName);
                    }
                    else if (/amount|total/.test(columnName)) {
                        table.float(columnName);
                    }
                    else {
                        table.string(columnName);
                    }
                });
            }
        );
}

function batchInsertCommittees(records, batchSize = defaultBatchSize) {
    return db.batchInsert(committeeTableName, records, batchSize);
}

function batchInsertContributions(records, batchSize = defaultBatchSize) {
    return db.batchInsert(contributionTableName, records, batchSize);
}

function batchInsertExpenditures(records, batchSize = defaultBatchSize) {
    return db.batchInsert(expenditureTableName, records, batchSize);
}

// Add negative contributions corresponding to refunds and bounced checks
function addDummyContributions() {
    db
        .select(
            'e.committee_name',
            'e.payee_first_name as contributor_first_name',
            'e.payee_middle_name as contributor_middle_name',
            'e.payee_last_name as contributor_last_name',
            'e.number_and_street',
            'e.city',
            'e.state',
            'e.zip',
            'e.normalized',
            'c.contributor_type',
            'e.purpose_of_expenditure as contribution_type',
            'c.employer_name',
            'c.employer_address',
            'c.occupation',
            'e.payment_date as receipt_date',
            db.raw('-e.amount AS amount')
        )
        .from('expenditures AS e')
        .innerJoin('contributions AS c', function () {
            this.on('e.committee_name', 'c.committee_name')
                .andOn('e.normalized', 'c.normalized');
        })
        .whereIn('purpose_of_expenditure', ['Refund', 'Return Check and Fees'])
        .groupBy('e.id')
        .orderBy('e.committee_name')
        .orderBy('e.payee_last_name')
        .orderBy('e.payee_first_name')
        .orderBy('e.payee_middle_name')
        .then(function (rows) {
            db.batchInsert(contributionTableName, rows, defaultBatchSize)
                .then(function () {
                    console.log('Dummy contributions inserted');
                    process.exit();
                });
        });
}

function getContributionInfo(filters) {
    let query = db
        .select(
            'office',
            'contributions.committee_name',
            'candidate_name',
            db.raw("SUM(CASE WHEN state = 'DC' THEN amount ELSE 0 END) AS dc_amount"),
            db.raw("SUM(CASE WHEN contributor_type IN ('Individual', 'Candidate') " +
                'THEN amount ELSE 0 END) AS ind_amount'),
            db.raw("SUM(CASE WHEN state = 'DC' AND contributor_type IN ('Individual', 'Candidate') " +
                'THEN amount ELSE 0 END) AS dc_ind_amount')
        )
        .count('* AS contributions')
        .sum('amount AS amount')
        .from('contributions')
        .innerJoin('committees', 'contributions.committee_name', 'committees.committee_name');
    query = addFilters(query, filters);
    return query.groupBy('office', 'contributions.committee_name', 'candidate_name')
        .orderBy('office')
        .orderBy('candidate_name');
}

function addFilters(oldQuery, filters) {
    let query = oldQuery.clone();
    if (filters.since) {
        query = query.andWhere('receipt_date', '>=', filters.since);
    }
    return query;
}

function getContributionSubtotals(filters) {
    let query = db.select('committee_name', 'normalized', 'state')
        .sum('amount AS subtotal')
        .from('contributions');
    query = addFilters(query, filters);
    return query.groupBy('committee_name', 'normalized', 'state')
        .having('subtotal', '>', 0);
}

function getContributorTypes(filters) {
    let query = db.distinct('contributor_type')
        .from('contributions');
    query = addFilters(query, filters);
    return query.orderBy('contributor_type')
        .then(function (rows) {
            return _.pluck(rows, 'contributor_type');
        });
}

function getContributionAmountsByType(filters) {
    let query = db.select('committee_name', 'contributor_type')
        .sum('amount AS amount')
        .from('contributions');
    query = addFilters(query, filters);
    return query.groupBy('committee_name', 'contributor_type')
        .then(function (rows) {
            const data = {};
            rows.forEach(function (c) {
                if (!data[c.committee_name]) {
                    data[c.committee_name] = {};
                }
                data[c.committee_name][c.contributor_type] = c.amount;
            });
            return data;
        });
}

function close() {
    return db.destroy();
}

module.exports = {
    addDummyContributions,
    batchInsertCommittees,
    batchInsertContributions,
    batchInsertExpenditures,
    committeeColumns,
    committeeTableName,
    contributionColumns,
    contributionTableName,
    close,
    createTables,
    expenditureColumns,
    expenditureTableName,
    getContributionAmountsByType,
    getContributionInfo,
    getContributionSubtotals,
    getContributorTypes,
};

