const fs = require('fs');
const path = require('path');
const statsLite = require('stats-lite');
const yaml = require('js-yaml');
const db = require('knex')(
    {
        client: 'sqlite3',
        connection: {
            filename: path.dirname(__dirname) + '/dc-ocf.sqlite',
        },
        pool: {
            afterCreate: (conn, cb) => conn.run('PRAGMA foreign_keys = ON', cb),
        },
        useNullAsDefault: true,
        // debug: true
    }
);
const {hyphenize, normalizeNameAndAddress} = require('./util');
const committeeTableName = 'committees';
const committeeColumns = [
    'committee_name',
    'candidate_name',
    'candidate_short_name',
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
    'contributor_organization_name',
    'number_and_street',
    'city',
    'state',
    'zip',
    'contributor_type',
    'contribution_type',
    'employer_name',
    'employer_address',
    'occupation',
    'receipt_date',
    'amount',
    'normalized',
];
const expenditureTableName = 'expenditures';
const expenditureColumns = [
    'committee_name',
    'payee_first_name',
    'payee_middle_name',
    'payee_last_name',
    'payee_organization_name',
    'number_and_street',
    'city',
    'state',
    'zip',
    'purpose_of_expenditure',
    'payment_date',
    'amount',
    'normalized',
];
const marTableName = 'mar';
const marColumns = [
    'ocf_address',
    'confidence_level',
    'address',
    'ward',
    'latitude',
    'longitude',
];
const committeeExtraTableName = 'committee_extras';
const committeeExtraColumns = [
    'committee_name',
    'committee_code',
    'filer_type',
    'is_fair_elections',
    'last_deadline',
    'traditional_limit',
    'fe_limit',
    'fe_contributor_threshold',
    'fe_amount_threshold',
    'fe_base_grant',
    'fe_max',
    'is_special',
];
const viewName = 'combined_contributions_view';
const defaultBatchSize = 25;

function createTables() {
    return db.schema.dropTableIfExists(contributionTableName)
        .dropTableIfExists(expenditureTableName)
        .dropTableIfExists(committeeTableName)
        .createTable(
            committeeTableName,
            function (table) {
                table.increments();
                for (const columnName of committeeColumns) {
                    if (/year/.test(columnName)) {
                        table.integer(columnName);
                    }
                    else {
                        table.string(columnName);
                    }
                }
                table.unique('committee_name');
                table.index(['candidate_short_name', 'election_year']);
            }
        )
        .createTable(
            contributionTableName,
            function (table) {
                table.increments();
                for (const columnName of contributionColumns) {
                    if (/_date/.test(columnName)) {
                        table.date(columnName);
                    }
                    else if (columnName === 'amount') {
                        table.float(columnName);
                    }
                    else if (columnName === 'ward') {
                        table.integer(columnName);
                    }
                    else {
                        table.string(columnName);
                    }
                }
                table.foreign('committee_name')
                    .references('committee_name')
                    .inTable(committeeTableName)
                    .onDelete('CASCADE');
                table.index('committee_name');
                table.index(['state', 'city']);
                table.index('normalized');
            }
        )
        .createTable(
            expenditureTableName,
            function (table) {
                table.increments();
                for (const columnName of expenditureColumns) {
                    if (/_date/.test(columnName)) {
                        table.date(columnName);
                    }
                    else if (/amount|total/.test(columnName)) {
                        table.float(columnName);
                    }
                    else {
                        table.string(columnName);
                    }
                }
                table.foreign('committee_name')
                    .references('committee_name')
                    .inTable(committeeTableName)
                    .onDelete('CASCADE');
                table.index('committee_name');
                table.index(['state', 'city']);
                table.index('normalized');
            }
        )
        .then(() => db.schema.hasTable(marTableName))
        .then(function (exists) {
            if (exists) {
                return null;
            }
            return db.schema.createTable(
                marTableName,
                function (table) {
                    table.increments();
                    for (const columnName of marColumns) {
                        switch (columnName) {
                            case 'confidence_level':
                            case 'ward':
                                table.integer(columnName);
                                break;
                            case 'latitude':
                            case 'longitude':
                                table.float(columnName);
                                break;
                            default:
                                table.string(columnName);
                        }
                    }
                    table.unique('ocf_address');
                }
            );
        })
        .then(() => db.schema.hasTable(committeeExtraTableName))
        .then(function (exists) {
            if (exists) {
                return null;
            }
            return db.schema.createTable(
                committeeExtraTableName,
                function (table) {
                    for (const columnName of committeeExtraColumns) {
                        if (/deadline/.test(columnName)) {
                            table.date(columnName);
                        }
                        else if (/^is_/.test(columnName)) {
                            table.boolean(columnName);
                        }
                        else if (/^fe_|limit/.test(columnName)) {
                            table.integer(columnName);
                        }
                        else {
                            table.string(columnName);
                        }
                    }
                    table.unique('committee_name');
                }
            );
        })
        .then(() => db.raw(`DROP VIEW IF EXISTS ${viewName}`))
        .then(function () {
            const groupColumns = [
                'com.election_year',
                'con.committee_name',
                'candidate_short_name',
                'candidate_name',
                'office',
                'normalized',
                'contributor_type',
                'state',
                'ward',
                'latitude',
                'longitude',
                'confidence_level',
            ].join(', ');
            return db.raw(
                `CREATE VIEW ${viewName} AS
                SELECT ${groupColumns},
                    SUM(amount) AS amount,
                    SUM(CASE WHEN amount > 0 THEN 1 WHEN amount < 0 THEN -1 ELSE 0 END) AS contributions,
                    CASE WHEN state = 'DC' THEN 1 ELSE 0 END AS is_dc,
                    CASE WHEN contributor_type IN ('Individual', 'Candidate') THEN 1 ELSE 0 END AS is_individual,
                    MIN(receipt_date) AS first_date
                FROM ${contributionTableName} con
                    INNER JOIN ${committeeTableName} com ON con.committee_name = com.committee_name
                    LEFT JOIN ${marTableName} m ON con.number_and_street = m.ocf_address
                GROUP BY ${groupColumns}
                HAVING SUM(amount) <> 0`
            );
        });
}

function batchInsert(tableName, records, batchSize = defaultBatchSize) {
    return db.batchInsert(tableName, records, batchSize);
}

// Add negative contributions corresponding to refunds and bounced checks
function addDummyContributions() {
    return db(contributionTableName)
        .where('amount', '<', 0)
        .del()
        .then(function () {
            return db
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
                .from(`${expenditureTableName} AS e`)
                .join(`${contributionTableName} AS c`, function () {
                    this.on('e.committee_name', 'c.committee_name')
                        .andOn('e.normalized', 'c.normalized');
                })
                .whereIn('purpose_of_expenditure', ['Refund', 'Return Check and Fees'])
                .groupBy('e.id')
                .orderBy('e.committee_name')
                .orderBy('e.payee_last_name')
                .orderBy('e.payee_first_name')
                .orderBy('e.payee_middle_name');
        })
        .then(rows => batchInsert(contributionTableName, rows));
}

function getContributionInfo(filters, ward) {
    const query = db(viewName)
        .select(
            'election_year',
            'office',
            'candidate_short_name',
            db.raw('SUM(CASE WHEN is_dc THEN amount ELSE 0 END) AS dc_amount'),
            db.raw('SUM(CASE WHEN is_individual THEN amount ELSE 0 END) AS ind_amount'),
            db.raw('SUM(CASE WHEN is_dc AND is_individual THEN amount ELSE 0 END) AS ind_dc_amount'),
            db.raw("SUM(CASE WHEN e.is_fair_elections AND is_dc AND contributor_type = 'Individual' THEN " +
                'MIN(amount, e.fe_limit) ELSE 0 END) AS fair_elections_eligible_amount'),
            db.raw("SUM(CASE WHEN contributor_type = 'Candidate' THEN amount ELSE 0 END) AS candidate_amount"),
            db.raw("SUM(CASE WHEN contributor_type = 'Candidate' THEN 0 ELSE " +
                'MAX(amount - (CASE WHEN is_fair_elections THEN e.fe_limit ELSE e.traditional_limit END), 0) END) ' +
                'AS amount_to_refund'),
            db.raw('COUNT(DISTINCT CASE WHEN is_dc THEN normalized END) AS dc_contributors'),
            db.raw('COUNT(DISTINCT CASE WHEN is_individual THEN normalized END) AS ind_contributors'),
            db.raw('COUNT(DISTINCT CASE WHEN is_dc AND is_individual THEN normalized END) AS ind_dc_contributors'),
            db.raw("COUNT(DISTINCT CASE WHEN e.is_fair_elections AND is_dc AND contributor_type = 'Individual' " +
                'THEN normalized END) AS fair_elections_eligible_contributors'),
            db.raw("COUNT(DISTINCT CASE WHEN contributor_type = 'Candidate' THEN normalized END) " +
                'AS candidate_contributors'),
            db.raw('GROUP_CONCAT(amount) AS amount_list'),
            'e.*'
        )
        .countDistinct('normalized AS contributors')
        .sum('amount AS amount')
        .sum('contributions AS contributions');
    if (ward) {
        query
            .select(
                db.raw('SUM(CASE WHEN ward = ? THEN amount ELSE 0 END) AS ward_amount', [ward]),
                db.raw('SUM(CASE WHEN ward = ? AND is_individual THEN amount ELSE 0 END) AS ind_ward_amount', [ward]),
                db.raw('COUNT(DISTINCT CASE WHEN ward = ? THEN normalized END) AS ward_contributors', [ward]),
                db.raw(
                    'COUNT(DISTINCT CASE WHEN ward = ? AND is_individual THEN normalized END) AS ind_ward_contributors',
                    [ward]
                )
            );
    }
    return query
        .join(`${committeeExtraTableName} AS e`, 'e.committee_name', `${viewName}.committee_name`)
        .modify(addFilters, filters)
        .having('amount', '>', filters.threshold || 0)
        .groupBy('election_year', 'office', 'candidate_short_name')
        .orderBy('election_year')
        .orderBy('office')
        .orderBy('candidate_short_name');
}

async function getContributionStats({filters, bins}) {
    let office = '';
    let ward = null;
    if (filters.office) {
        office = await getMatchingOffice(filters.office, filters.year);
        const m = office.match(/Ward (\d+)/);
        if (m) {
            ward = +m[1];
        }
    }
    const rows = await getContributionInfo(filters, ward);
    for (const row of rows) {
        row.amount_list = row.amount_list.split(',')
            .map(Number)
            .sort((a, b) => a - b);
        if (bins && bins.length) {
            row.bin_amounts = bins.map(() => 0).concat([0]);
            for (const amount of row.amount_list) {
                let i = 0;
                for (i = 0; i < bins.length; i++) {
                    if (amount <= bins[i]) {
                        row.bin_amounts[i] += amount;
                        break;
                    }
                }
                if (i >= bins.length) {
                    row.bin_amounts[i] += amount;
                }
            }
        }
        row.dc_percent = 100 * row.dc_amount / row.amount;
        row.ind_percent = 100 * row.ind_amount / row.amount;
        row.ind_dc_percent = 100 * row.ind_dc_amount / row.amount;
        if (ward) {
            row.ward_percent = 100 * row.ward_amount / row.amount;
            row.ind_ward_percent = 100 * row.ind_ward_amount / row.amount;
        }
        row.candidate_percent = 100 * row.candidate_amount / row.amount;
        row.mean = statsLite.mean(row.amount_list);
        row.median = statsLite.median(row.amount_list);
        if (row.is_fair_elections &&
            row.fair_elections_eligible_contributors > row.fe_contributor_threshold &&
            row.fair_elections_eligible_amount > row.fe_amount_threshold) {
            row.fair_elections_addition = Math.min(
                row.fair_elections_eligible_amount * 5 + row.fe_base_grant,
                row.fe_max
            );
        }
        else {
            row.fair_elections_addition = 0;
        }
        if (row.is_fair_elections) {
            row.amount_to_refund += Math.max(row.candidate_amount - 2500, 0);
        }
        row.adjusted_amount = row.amount - row.amount_to_refund;
        row.fair_elections_total = row.adjusted_amount + row.fair_elections_addition;
        delete row.amount_list;
    }
    return rows;
}

function getMatchingOffice(pattern, year) {
    return db(committeeTableName)
        .distinct('office')
        .modify(addFilters, {office: pattern, year})
        .then(function (rows) {
            if (rows.length === 0) {
                throw new Error(`Pattern "${pattern}" matches no offices`);
            }
            if (rows.length > 1) {
                throw new Error(`Pattern "${pattern}" matches more than one office`);
            }
            return rows[0].office;
        });
}

function addFilters(query, filters) {
    if (filters) {
        if (filters.since) {
            query.andWhere('receipt_date', '>=', filters.since);
        }
        if (filters.office) {
            query.andWhere('office', filters.office);
        }
        if (filters.candidates) {
            query.andWhere('candidate_short_name', 'IN', filters.candidates);
        }
        if (filters.year) {
            query.andWhere('election_year', filters.year);
        }
        for (const column of ['ward', 'state']) {
            if (filters.hasOwnProperty(column)) {
                query.andWhere(column, filters[column]);
            }
        }
    }
}

function deleteContributions(committeeName) {
    return db(contributionTableName)
        .where('committee_name', committeeName)
        .del();
}

function deleteExpenditures(committeeName) {
    return db(expenditureTableName)
        .where('committee_name', committeeName)
        .del();
}

function getUnverifiedContributionAddresses(limit = 100, year) {
    return db(contributionTableName)
        .distinct('number_and_street AS address')
        .join(committeeTableName, `${committeeTableName}.committee_name`, `${contributionTableName}.committee_name`)
        .leftJoin(marTableName, 'ocf_address', 'number_and_street')
        .where('state', 'DC')
        .andWhere('confidence_level', null)
        .whereNot('number_and_street', '')
        .modify(addFilters, {year})
        .orderBy('address')
        .limit(limit)
        .then(rows => rows.map(r => r.address)); // don't know why .pluck() doesn't work here
}

function updateContribution(id, partialRecord) {
    return db(contributionTableName)
        .where('id', id)
        .update(partialRecord);
}

function getDcContributionsWithPositions(filters) {
    const query = db(viewName)
        .select(
            'candidate_short_name AS candidate',
            db.raw('ROUND(latitude, 5) AS latitude'),
            db.raw('ROUND(longitude, 5) AS longitude')
        )
        .countDistinct('normalized AS contributors')
        .where('state', 'DC')
        .whereIn('contributor_type', ['Individual', 'Candidate'])
        .where('confidence_level', '>', 90)
        .modify(addFilters, filters);
    if (filters.committees) {
        query.whereIn('committee_name', filters.committees.map(c => c.committee_name));
    }
    return query
        .groupBy('candidate_short_name', 'latitude', 'longitude')
        .then(function (rows) {
            const data = {};
            for (const candidate of filters.committees.map(c => c.candidate_short_name)) {
                data[candidate] = [];
            }
            for (const {candidate, latitude, longitude, contributors} of rows) {
                data[candidate].push([latitude, longitude, contributors]);
            }
            return data;
        });
}

function getContributorsByDate(filters) {
    return db(viewName)
        .select('first_date AS receipt_date', 'candidate_short_name')
        .countDistinct('normalized AS contributors')
        .sum('amount AS amount')
        .modify(addFilters, filters)
        .groupBy('receipt_date', 'candidate_short_name')
        .orderBy('receipt_date')
        .orderBy('candidate_short_name');
}

function getCandidatesForOffice(office, year, threshold = 0) {
    return db(viewName)
        .select('candidate_short_name', 'committee_name')
        .sum('amount AS subtotal')
        .modify(addFilters, {office, year})
        .groupBy('candidate_short_name')
        .having('subtotal', '>', threshold)
        .orderBy('candidate_short_name')
        .pluck('candidate_short_name');
}

function getCommitteesForOffice(office, year, threshold = 0) {
    return db(viewName)
        .select(
            `${viewName}.committee_name`,
            `${viewName}.candidate_short_name`,
            'office',
            'is_fair_elections'
        )
        .sum('amount AS subtotal')
        .countDistinct('normalized AS contributors')
        .join(committeeExtraTableName, `${viewName}.committee_name`, `${committeeExtraTableName}.committee_name`)
        .modify(addFilters, {office, year})
        .groupBy(`${viewName}.committee_name`)
        .having('subtotal', '>', threshold)
        .orderBy('contributors', 'DESC');
}

async function areAllCandidatesFairElections(office, year) {
    const candidates = await getCandidatesForOffice(office, year);
    return db(committeeExtraTableName)
        .count('*', {as: 'non_fe'})
        .join(committeeTableName, `${committeeExtraTableName}.committee_name`, `${committeeTableName}.committee_name`)
        .whereIn('candidate_short_name', candidates)
        .whereNot('is_fair_elections', true)
        .where('election_year', year)
        .then(values => values[0].non_fe === 0);
}

function getLastDeadlines(office, year) {
    return db(committeeExtraTableName)
        .select('candidate_short_name', 'last_deadline')
        .sum('amount AS subtotal')
        .join(viewName, `${viewName}.committee_name`, `${committeeExtraTableName}.committee_name`)
        .modify(addFilters, {office, year})
        .whereNotNull('last_deadline')
        .groupBy('candidate_short_name')
        .having('subtotal', '>', 0)
        .orderBy('candidate_short_name')
        .then(function (rows) {
            const data = {};
            for (const row of rows) {
                data[row.candidate_short_name] = row.last_deadline;
            }
            return data;
        });
}

function getContributorsByPlace({candidate, office, year, byWard}) {
    const column = byWard ? 'ward' : 'state';
    const query = db(viewName)
        .select(`${column} AS place`)
        .countDistinct('normalized AS contributors')
        .modify(addFilters, {year})
        .where('candidate_short_name', candidate)
        .where('office', office);
    if (byWard) {
        query.where('state', 'DC');
    }
    return query.groupBy(column)
        .orderBy(column)
        .then(function (rows) {
            const data = {};
            for (const row of rows) {
                const place = row.place || 'Unknown';
                data[place] = row.contributors;
            }
            return data;
        });
}

function getContributorPlaces(office, year, byWard = false) {
    const column = byWard ? 'ward' : 'state';
    const query = db(viewName)
        .select(column)
        .countDistinct('normalized AS contributors')
        .modify(addFilters, {office, year});
    if (byWard) {
        query.where('state', 'DC');
    }
    return query.groupBy(column)
        .orderBy('contributors', 'DESC')
        .then(rows => rows.map(row => row[column] || 'Unknown'));
}

function getAvailableContests(threshold, year) {
    return db(viewName)
        .select('election_year', 'office')
        .sum('amount AS subtotal')
        .modify(addFilters, {year})
        .groupBy('election_year', 'office')
        .having('subtotal', '>', threshold)
        .orderBy('election_year')
        .orderBy('office')
        .then(function (rows) {
            const data = {};
            let prevYear;
            for (const row of rows) {
                if (row.election_year !== prevYear) {
                    data[row.election_year] = [];
                    prevYear = row.election_year;
                }
                data[row.election_year].push(row.office);
            }
            return data;
        });
}

async function createCommitteeExtraRecords(partialRecords) {
    await db.raw(
        `INSERT OR IGNORE INTO ${committeeExtraTableName} (committee_name)
        SELECT committee_name FROM ${committeeTableName}`
    );
    for (const partialRecord of partialRecords) {
        const committeeName = partialRecord.committee_name;
        delete partialRecord.committee_name;
        const updateList = Object.keys(partialRecord)
            .map(column => `${column} = ?`)
            .join(', ');
        await db.raw(
            `UPDATE ${committeeExtraTableName} SET ${updateList} WHERE committee_name = ?`,
            [...Object.values(partialRecord), committeeName]
        );
    }
}

function updateCommitteeExtra(committeeName, update) {
    return db(committeeExtraTableName)
        .where('committee_name', committeeName)
        .update(update);
}

function getCommittee(committeeName) {
    return db(committeeTableName)
        .select('*')
        .join(
            committeeExtraTableName,
            `${committeeTableName}.committee_name`,
            `${committeeExtraTableName}.committee_name`
        )
        .where(`${committeeTableName}.committee_name`, committeeName)
        .limit(1)
        .then(rows => rows[0]);
}

function getCommitteeNameByCode(committeeCode) {
    return db({c: committeeTableName})
        .select('c.committee_name')
        .join(committeeExtraTableName, 'c.committee_name', `${committeeExtraTableName}.committee_name`)
        .where('committee_code', committeeCode)
        .then(rows => (rows.length ? rows[0].committee_name : null));
}

async function setCommitteeCodes() {
    const committeeNames = await db(committeeExtraTableName)
        .select('committee_name')
        .whereNull('committee_code')
        .pluck('committee_name');
    for (const committeeName of committeeNames) {
        await updateCommitteeExtra(committeeName, {committee_code: hyphenize(committeeName)});
    }
    return committeeNames.length;
}

function getOfficesForReport(threshold, year) {
    return db(viewName)
        .select('office')
        .sum('amount AS subtotal')
        .modify(addFilters, {year})
        .groupBy('office')
        .having('subtotal', '>', threshold)
        .orderBy('office')
        .pluck('office');
}

async function runFixes() {
    const statements = fs.readFileSync(path.dirname(__dirname) + '/fixes.sql', 'utf-8')
        .trim()
        .split(';\n');
    for (let statement of statements) {
        statement = statement.replace(
            `UPDATE ${contributionTableName} SET `,
            `UPDATE ${contributionTableName} SET normalized = null, `
        );
        await db.raw(statement);
    }
    await setNormalized();
}

async function setNormalized() {
    for (const tableName of [contributionTableName, expenditureTableName]) {
        const rows = await db(tableName)
            .select('*')
            .where('normalized', null);
        for (const row of rows) {
            await db(tableName)
                .update('normalized', normalizeNameAndAddress(row))
                .where('id', row.id);
        }
    }
}

async function setOcfLimits() {
    const yamlFile = path.dirname(__dirname) + '/ocf-limits.yaml';
    const ocfLimits = yaml.safeLoad(fs.readFileSync(yamlFile));
    const rows = await db(committeeExtraTableName)
        .select(`${committeeExtraTableName}.committee_name`, 'office')
        .join(committeeTableName, `${committeeTableName}.committee_name`, `${committeeExtraTableName}.committee_name`)
        .whereNull('traditional_limit');
    for (const row of rows) {
        let limits;
        for (const [pattern, officeLimits] of Object.entries(ocfLimits)) {
            if (row.office.includes(pattern)) {
                limits = officeLimits;
                break;
            }
        }
        if (!limits) {
            console.warn(`Unexpected office "${row.office}" when setting OCF limits`);
            continue;
        }
        await db(committeeExtraTableName)
            .where('committee_name', row.committee_name)
            .update(limits);
    }
}

function getCommitteesWithTopSharedContributors({candidate, office, year, limit = 10}) {
    return db.raw(
        `SELECT c2.candidate_short_name,
            c2.candidate_name,
            c2.office,
            c2.election_year,
            COUNT(DISTINCT c1.normalized) AS contributors
        FROM ${viewName} c1 INNER JOIN ${viewName} c2
            ON c1.normalized = c2.normalized
        WHERE
            (
                c1.candidate_short_name <> c2.candidate_short_name
                    OR c1.office <> c2.office
                    OR c1.election_year <> c2.election_year
            )
            AND c1.candidate_short_name = ?
            AND c1.office = ?
            AND c1.election_year = ?
        GROUP BY 1, 2, 3, 4
        ORDER BY 5 DESC, 1, 2, 3, 4
        LIMIT ?`,
        [candidate, office, year, limit]
    );
}

function getContributorCount({candidate, office, year}) {
    return db(viewName)
        .countDistinct('normalized AS count')
        .where('amount', '>', 0)
        .where('candidate_short_name', candidate)
        .where('office', office)
        .where('election_year', year)
        .then(rows => (rows[0] ? rows[0].count : null));
}

function close() {
    return db.destroy();
}

module.exports = {
    addDummyContributions,
    areAllCandidatesFairElections,
    batchInsert,
    close,
    committeeColumns,
    committeeTableName,
    committeeExtraColumns,
    committeeExtraTableName,
    contributionColumns,
    contributionTableName,
    createCommitteeExtraRecords,
    createTables,
    deleteContributions,
    deleteExpenditures,
    expenditureColumns,
    expenditureTableName,
    getAvailableContests,
    getCandidatesForOffice,
    getCommitteesForOffice,
    getCommittee,
    getCommitteeNameByCode,
    getContributionStats,
    getDcContributionsWithPositions,
    getCommitteesWithTopSharedContributors,
    getContributorCount,
    getContributorsByDate,
    getContributorsByPlace,
    getContributorPlaces,
    getLastDeadlines,
    getMatchingOffice,
    getOfficesForReport,
    getUnverifiedContributionAddresses,
    marColumns,
    marTableName,
    runFixes,
    setCommitteeCodes,
    setNormalized,
    setOcfLimits,
    updateCommitteeExtra,
    updateContribution,
};

