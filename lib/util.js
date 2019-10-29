const path = require('path');
const csvDir = path.dirname(__dirname) + '/csv';
const streetAbbrev = {
    STREET: 'ST',
    ROAD: 'RD',
    DRIVE: 'DR',
    AVENUE: 'AVE',
    COURT: 'CT',
    LANE: 'LN',
    TERRACE: 'TER',
    CIRCLE: 'CIR',
    BOULEVARD: 'BLVD',
    HIGHWAY: 'HWY',
    PLACE: 'PL',
};
const streetAbbrevRegexp = new RegExp('\\b(' + Object.keys(streetAbbrev).join('|') + ')\\b');
const ordinalAbbrev = {
    FIRST: '1ST',
    SECOND: '2ND',
    THIRD: '3RD',
    FOURTH: '4TH',
    FIFTH: '5TH',
    SIXTH: '6TH',
    SEVENTH: '7TH',
    EIGHTH: '8TH',
    NINTH: '9TH',
    TENTH: '10TH',
    ELEVENTH: '11TH',
    TWELFTH: '12TH',
    THIRTEENTH: '13TH',
    FOURTEENTH: '14TH',
    FIFTEENTH: '15TH',
    SIXTEENTH: '16TH',
    SEVENTEENTH: '17TH',
    EIGHTEENTH: '18TH',
    NINETEENTH: '19TH',
    TWENTIETH: '20TH',
};
const ordinalAbbrevRegexp = new RegExp('\\b(' + Object.keys(ordinalAbbrev).join('|') + ')\\b');

function normalizeNameAndAddress(name, address = name) {
    if (typeof name === 'object') {
        name = makeName(name);
    }
    if (typeof address === 'object') {
        address = makeAddress(address);
    }
    let normalized = name.toUpperCase()
        .replace(/[ ,]*,[ ,]*/g, ' ')
        .replace(/\./g, '')
        .replace(/^(MR|MS|MRS|DR) /, '')
        .replace(/ AND | ?\+ ?/g, ' & ')
        .replace(/^THE /, '')
        .replace(/(?: (?:LTD|LLC|LLP|PLLC|INC|CORP|LP|PA|CO|LLLP|PLLP|PLC|PC))+$/, '')
        .replace(/ ?& ?/, ' ')
        // .replace(/ [A-Z] /g, ' ') // remove middle initials
        // .replace(/ (JR|SR|I{1,3})$/, '')
        .replace(/[- ]*-[- ]*/g, ' ');
    if (address) {
        normalized += ', ' + address.toUpperCase()
            .replace(/[ ,]*,[ ,]*/g, ' ')
            .replace(/\./g, '')
            .replace(/'/g, '')
            .replace(/[()]/, '')
            .replace(/ [\d -]+$/, '') // remove zip
            .replace(/[- ]*-[- ]*/g, ' ')
            .replace(/^(?:SUITE|STE|APT|APARTMENT|UNIT)[ #]+\S+ /, '')
            .replace(/\b(?:SUITE|STE|APT|APARTMENT|UNIT)[ #]+/, '#')
            .replace(/# /, '#')
            .replace(/( [NS][EW] )\S+ (?=WASHINGTON)/, '$1') // apt number with no #
            .replace(/ FL(?:OOR)? \d\d?(?:[NR]?D|ST|TH)?(?: |$)/, ' ')
            .replace(/ \d\d?(?:[NR]?D|ST|TH)? FL(?:OOR)?(?: |$)/, ' ')
            .replace(/E CAPITOL/, 'EAST CAPITOL')
            .replace(/N CAPITOL/, 'NORTH CAPITOL')
            .replace(/S CAPITOL/, 'SOUTH CAPITOL')
            .replace(/ VIRGINIA$/, ' VA')
            .replace(/ MARYLAND$/, ' MD')
            .replace(/ DISTRICT OF COLUMBIA$/, ' DC')
            .replace(/ [NS] [EW] /, ' $1$2 ')
            .replace(/^(\d+\S*) ([NS][EW]) (.+)(?= WASHINGTON DC$)/, '$1 $3 $2')
            .replace(/ MC LEAN /g, ' MCLEAN ')
            .replace(/( \w+)(\1 [A-Z]{2})$/, '$2') // remove repeated city
            .replace(/( \w+ [A-Z]{2})\1$/, '$1') // remove repeated city and state
            .replace(/ #\S+/, '') // remove apartment number
            .replace(/\W+/g, ' ')
            .replace(streetAbbrevRegexp, (m, p1) => streetAbbrev[p1])
            .replace(/ EYE ST /, ' I ST ')
            .replace(/ QUE ST /, ' Q ST ')
            .replace(ordinalAbbrevRegexp, (m, p1) => ordinalAbbrev[p1])
            .trim();
    }
    return normalized;
}

function makeName(r) {
    const prefix = r.hasOwnProperty('contributor_last_name') ? 'contributor_' : 'payee_';
    return ['first_name', 'middle_name', 'last_name', 'organization_name']
        .map(c => r[prefix + c])
        .filter(v => !!v)
        .join(' ');
}

function makeAddress(r) {
    let address = r.number_and_street || '';
    if (r.city) {
        if (address) {
            address += ', ';
        }
        address += r.city;
    }
    if (r.state) {
        if (address) {
            address += ', ';
        }
        address += r.state;
    }
    if (r.zip) {
        if (address) {
            address += ' ';
        }
        address += r.zip;
    }
    return address;
}

function fixDate(date) {
    return date && date.replace(/^(\d\d)\/(\d\d)\/(\d{4})$/, '$3-$1-$2');
}

function fixAmount(amount) {
    return amount && /^[$.,\d]+$/.test(amount) ? +amount.replace(/[$,]/g, '') : amount;
}

function parseAddress(address) {
    const lines = address.trim().split('\n');
    const lastLine = lines.pop();
    const m = lastLine.match(/^(\S.+\S),\s*([A-Z]{2})[- ](\d{5}(?:-\d{4})?)$/);
    if (!m) {
        throw new Error(`Unexpected address format "${address}"`);
    }
    return {
        number_and_street: lines.join(', '),
        city: m[1],
        state: m[2],
        zip: m[3],
    };
}

function parseName(name) {
    const m = name.match(/^(?:(\S+)(?: (.+?))? )?(\S+(?: (?:[JS]r|I+|IV|VI*)\.?)?)$/);
    if (!m) {
        throw new Error(`Unexpected name format "${name}"`);
    }
    return {
        first: m[1] || '',
        middle: m[2] || '',
        last: m[3],
    };
}

function getCsvFilename(recordType, filerType) {
    const basename = recordType + (filerType === 'principal' ? '' : ('-' + filerType));
    return `${csvDir}/${basename}.csv`;
}

function hyphenize(s) {
    return s.replace(/([a-z])(?=[A-Z])/g, '$1-')
        .toLowerCase()
        .replace(/[^a-z\d]+/g, '-')
        .replace(/^-|-$/g, '');
}

module.exports = {
    fixAmount,
    fixDate,
    getCsvFilename,
    hyphenize,
    makeAddress,
    makeName,
    normalizeNameAndAddress,
    parseAddress,
    parseName,
};
