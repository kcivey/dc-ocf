const assert = require('assert');
const path = require('path');
const stateAbbrToName = require('./us-states');
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
        .replace(/'/g, '')
        .replace(/^(MR|MS|MRS|DR) /, '')
        .replace(/ AND | ?\+ ?/g, ' & ')
        .replace(/^THE /, '')
        .replace(/(?: (?:LTD|LLC|PLL?C|INC(?:ORPORATED)?|CORP(?:ORATION)?|L+P|PA|CO|PLLP|PC|ESQ|MD|PHD|DDS)+)$/, '')
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
            .replace(/ 1\/2\b/, '')
            .replace(/# /, '#')
            .replace(/( [NS][EW] )\S+ (?=WASHINGTON)/, '$1') // apt number with no #
            .replace(/ FL(?:OOR)? \d\d?(?:[NR]?D|ST|TH)?(?: |$)/, ' ')
            .replace(/ \d\d?(?:[NR]?D|ST|TH)? FL(?:OOR)?(?: |$)/, ' ')
            .replace(/ E CAPITOL/, ' EAST CAPITOL')
            .replace(/ N (CAPITOL|CAROLINA|DAKOTA)/, ' NORTH $1')
            .replace(/ S (CAPITOL|CAROLINA|DAKOTA)/, ' SOUTH $1')
            .replace(/ N (HAMPSHIRE|JERSEY|MEXICO)/, ' NEW $1')
            .replace(/ VIRGINIA$/, ' VA')
            .replace(/ MARYLAND$/, ' MD')
            .replace(/ DISTRICT OF COLUMBIA$/, ' DC')
            .replace(/ ([NS]) ([EW]) /, ' $1$2 ')
            .replace(/^(\d+\S*) ([NS][EW]) (.+)(?= WASHINGTON DC$)/, '$1 $3 $2')
            .replace(/ MC LEAN /g, ' MCLEAN ')
            .replace(/( \w+)(\1 [A-Z]{2})$/, '$2') // remove repeated city
            .replace(/( \w+ [A-Z]{2})\1$/, '$1') // remove repeated city and state
            .replace(/ #\S+/, '') // remove apartment number
            .replace(/\W+/g, ' ')
            .replace(streetAbbrevRegexp, (m, p1) => streetAbbrev[p1])
            .replace(/ EYE ST /, ' I ST ')
            .replace(/ QUE ST /, ' Q ST ')
            .replace(/ AV /, ' AVE ')
            .replace(/ MASS AVE/, ' MASSACHUSETTS AVE')
            .replace(/ CONN AVE/, ' CONNECTICUT AVE')
            .replace(/ (?:MARTIN L(?:UTHER)? KING|MLK|M L K)(?:J\W+)?\b/, ' MLK')
            .replace(ordinalAbbrevRegexp, (m, p1) => ordinalAbbrev[p1])
            .replace(/\b([A-Z]{2})(?= AVE)/, (m, p1) => (stateAbbrToName[p1] || p1).toUpperCase())
            .trim();
    }
    // Messy fixes
    normalized = normalized.replace(/^JOHN V ZOTTOLI, /, 'JOHN ZOTTOLI, ')
        .replace(/ ZOT(?:OLLI|TOLO), /, ' ZOTTOLI, ')
        .replace(/(ZOTTOLI.*) 30125/, '$1 3025')
        .replace(/^LINDA W ZOTTOLI, /, 'LINDA ZOTTOLI, ')
        .replace(/^JOHN (?:J )?CAPOZZI?, 1?3612 .+ DC$/, 'JOHN CAPOZZI, 3612 AUSTIN ST SE WASHINGTON DC')
        .replace(/^(DYNAMIC CONCEPTS, 1730).*(?= WASHINGTON)/, '$1 17TH ST NE')
        .replace(/^DAVID A JANNARONE, /, 'DAVID JANNARONE, ')
        .replace(/(JANNARONE.*) 3765/, '$1 3715')
        .replace(/^BRETT\b.* GREENE?, 1330 GERAN.*/, 'BRETT GREENE, 1330 GERANIUM ST NW WASHINGTON DC')
        .replace(/^THORN.+ POZEN, 4822 UP.*/, 'THORN POZEN, 4822 UPTON ST NW WASHINGTON DC')
        .replace(/^KATH.* BRADLEY, 2211 30TH.*/, 'KATHERINE BRADLEY, 2211 30TH ST NW WASHINGTON DC')
        .replace(/^MANATT PHELPS.*, 1135.*/, 'MANATT PHELPS PHILLIPS, 11355 W OLYMPIC BLVD LOS ANGELES CA')
        .replace(/^(?:NEIL ALBERT|ALBERT NEIL), 135.+LOCUST.*/, 'NEIL ALBERT, 1358 LOCUST RD NW WASHINGTON DC')
        .replace(/^CLAUD.* BAILEY, .+BEACH .*DC$/, 'CLAUDE BAILEY, 1815 E BEACH DR NW WASHINGTON DC')
        .replace('DAVID MEADOWS, 305 K ST NW', 'DAVID MEADOWS, 305 K ST SE')
        .replace(/^PEDRO\b.* ALFONSO, 1809 PARKSIDE .* DC$/, 'PEDRO ALFONSO, 1809 PARKSIDE DR NW WASHINGTON DC')
        .replace(/^COREY\b.* GRIFFIN, 1515 LAW.* DC$/, 'COREY GRIFFIN, 1515 LAWRENCE ST NE WASHINGTON DC')
        .replace(/^BEVERLY PERRY, 17\d\d HOLL.* DC$/, 'BEVERLY PERRY, 1716 HOLLY ST NW WASHINGTON DC')
        .replace(/^MAX J BROWN, 475 H /, 'MAX BROWN, 475 H ')
        .replace(/^JAIR K LYNCH, /, 'JAIR LYNCH, ')
        .replace(/^REGAN.* LONG\b.* 1919 M .+ DC$/, 'REGAN ZAMBRI LONG, 1919 M ST NW WASHINGTON DC')
        .replace(/^WILLIAM B ALSUP\b/, 'WILLIAM ALSUP')
        .replace(/^TRANSCO.+ BENNING .+ WASH.+/, 'TRANSCO, 3399 BENNING RD NE WASHINGTON DC');
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
    const fixedDate = date ? date.replace(/^(\d\d)\/(\d\d)\/(\d{4})$/, '$3-$1-$2') : null;
    if (fixedDate) {
        assert(fixedDate.match(/^\d{4}-\d\d-\d\d$/), `Unexpected date format "${date}"`);
    }
    return fixedDate;
}

function fixAmount(rawAmount) {
    const amount = rawAmount.replace(/^\((.+)\)$/, '-$1'); // change parens to minus
    return amount && /^-?[$.,\d]+$/.test(amount) ? +amount.replace(/[$,]/g, '') : amount;
}

function parseAddress(address) {
    address = address.replace(/\bWA-200/, 'DC-200') // Washington confusion
        .replace(/DC-`200/, 'DC-200') // remove extraneous character
        .replace(', DC-DC', ', DC-00000') // missing ZIPs
        .replace(/(?:^|\n)DC-(?=\d+)/, '$1Washington, DC-') // add missing city
        .replace(/\b(?:0|ZZ)-\w{3} ?\w{3}$/, 'ZZ-00000') // UK address
        .replace(/( [A-Z][A-Z]-)\n(\d{5})/, '$1$2') // another kluge
        .replace(/(MA|NJ)-(\d{4})$/, '$1-0$2') // add missing 0
        .replace(/VI-(\d{3})$/, 'VA-00$1') // and more missing 0s
        .replace(/( [A-Z]{2}-)0\.(\d{5})/, '$1$2') // yet another kluge
        .replace(/ AA-0$/, ' AA-00000'); // Bowser missing data
    const lines = address.trim().split('\n');
    const lastLine = lines.pop();
    const m = lastLine.match(/^(\S.*)?\s*,\s*([A-Z]{2})[- ](\d{5}(?:-\d{4})?)$/);
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
    const m = name.match(/^(?:(\S+)(?: (.+?))?? )?(\S+(?: (?:[JS]r|I+|IV|VI*)\.?)?)$/);
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
