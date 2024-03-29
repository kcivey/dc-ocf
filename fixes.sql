UPDATE committees SET candidate_name = 'Jordan Grossman', candidate_short_name = 'Grossman' WHERE candidate_name = 'Jordan Grosman';
UPDATE committees SET office = 'Council Ward 6' WHERE committee_name = 'Darrel Thompson Ward 6 Exploratory Committee';
UPDATE contributions SET receipt_date = '2019-05-16' WHERE receipt_date = '1986-05-16' AND committee_name = 'Jordan Grossman for Ward 2';
UPDATE contributions SET receipt_date = '2019-09-22' WHERE receipt_date = '2018-09-22' AND committee_name = 'Jordan Grossman for Ward 2';
UPDATE contributions SET receipt_date = '2019-09-12' WHERE receipt_date = '2011-09-12' AND committee_name = 'Jordan Grossman for Ward 2';
UPDATE contributions SET receipt_date = '2019-09-15' WHERE receipt_date = '2015-09-15' AND committee_name = 'Committee to Elect Janeese Lewis George';
UPDATE contributions SET receipt_date = '2019-12-01' WHERE receipt_date = '2001-12-01' AND committee_name = 'Committee to Elect Renee Bowser';
UPDATE contributions SET receipt_date = '2019-12-09' WHERE receipt_date = '2018-12-09' AND committee_name = 'Patrick Kennedy for Ward 2';
UPDATE contributions SET receipt_date = '2019-11-25' WHERE receipt_date = '2001-11-25' AND committee_name = 'Committee to Elect Stuart Anderson 2020';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, 'Chancellors', 'Chancellor''s') WHERE number_and_street LIKE '%Chancellors%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, 'Queen Anne''s', 'Queen Annes') WHERE number_and_street LIKE '%Queen Anne''s%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, 'Buuchanan', 'Buchanan') WHERE number_and_street LIKE '%Buuchanan%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, 'Quncy', 'Quincy') WHERE number_and_street LIKE '%Quncy%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, 'N.W', 'NW') WHERE number_and_street LIKE '%N.W%';
UPDATE contributions SET number_and_street = number_and_street || ' NW' WHERE number_and_street LIKE '% Western Ave'
    OR number_and_street LIKE ' New Hampshire Ave' OR number_and_street LIKE '% Garfield Terrace' OR number_and_street LIKE '% Chevy Chase Parkway';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, 'New Mexico Ane', 'New Mexico Ave') WHERE number_and_street LIKE '%New Mexico Ane%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Sst ', ' St ') WHERE number_and_street LIKE '% Sst %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' N Gate ', ' Northgate ') WHERE number_and_street LIKE '% N Gate %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Rock Creek R', ' Rock Creek Church R') WHERE number_and_street LIKE '% Rock Creek R%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Rhode lsland ', ' Rhode Island ') WHERE number_and_street LIKE '% Rhode lsland %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Masschusetts ', ' Massachusetts ') WHERE number_and_street LIKE '% Masschusetts %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Farragust ', ' Farragut ') WHERE number_and_street LIKE '% Farragust %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Pleasnat ', ' Pleasant ') WHERE number_and_street LIKE '% Pleasnat %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Randolf ', ' Randolph ') WHERE number_and_street LIKE '% Randolf %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Varumn ', ' Varnum ') WHERE number_and_street LIKE '% Varumn %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Ingelside ', ' Ingleside ') WHERE number_and_street LIKE '% Ingelside %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' AspenSt ', ' Aspen St ') WHERE number_and_street LIKE '% AspenSt %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Piney Brand ', ' Piney Branch ') WHERE number_and_street LIKE '% Piney Brand %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Deer Xing', ' Deer Crossing') WHERE number_and_street LIKE '% Deer Xing%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Upshur Ave ', ' Upshur St ') WHERE number_and_street LIKE '% Upshur Ave %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Monroe Ave ', ' Monroe St ') WHERE number_and_street LIKE '% Monroe Ave %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Leegate Rd', ' Leegate Rd NW') WHERE number_and_street LIKE '% Leegate Rd';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Montana Ave', ' Montana Ave NE') WHERE number_and_street LIKE '% Montana Ave';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Kilbourne', ' Kilbourne Pl NW') WHERE number_and_street LIKE '% Kilbourne';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Arkansas', ' Arkansas Ave NW') WHERE number_and_street LIKE '% Arkansas';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Warder St', ' Warder St NW') WHERE number_and_street LIKE '% Warder St';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Acker Pl', ' Acker Pl NE') WHERE number_and_street LIKE '% Acker Pl';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Flagler', ' Flagler Pl NW') WHERE number_and_street LIKE '% Flagler';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Bunker Hill Rd', ' Bunker Hill Rd NE') WHERE number_and_street LIKE '% Bunker Hill Rd';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Bunker Hil ', ' Bunker Hill ') WHERE number_and_street LIKE '% Bunker Hil %';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Douglass Pl', ' Douglas Pl') WHERE number_and_street LIKE '% Douglass Pl%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Maryland Ave #', ' Maryland Ave NW #') WHERE number_and_street LIKE '% Maryland Ave #%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' MacArthur Blvds. #', ' MacArthur Blvd NW #') WHERE number_and_street LIKE '% MacArthur Blvds. #%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Connecticut Ave 1', ' Connecticut Ave NW 1') WHERE number_and_street LIKE '% Connecticut Ave 1%';
UPDATE contributions SET number_and_street = '3293 Worthington St NW' WHERE number_and_street = '6293 Worthington St NW';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Lawrence NE', ' Lawrence St NE') WHERE number_and_street LIKE '% Lawrence NE%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, '1432 Leegate', '1432 Leegate Rd NW') WHERE number_and_street = '1432 Leegate';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Martin Luther King Jr SE', ' Martin Luther King Jr Ave SE')
    WHERE number_and_street LIKE '% Martin Luther King Jr SE%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' NW#', ' NW #') WHERE number_and_street LIKE '% NW#%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' 21st nw', ' 21st St NW') WHERE number_and_street LIKE '% 21st nw%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' 13th NW', ' 13th St NW') WHERE number_and_street LIKE '% 13th NW%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' M NW', ' M St NW') WHERE number_and_street LIKE '% M NW%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' 8th NE', ' 8th St NE') WHERE number_and_street LIKE '% 8th NE%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' A NE', ' A St NE') WHERE number_and_street LIKE '% A NE%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' 3rd NE', ' 3rd St NE') WHERE number_and_street LIKE '% 3rd NE%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Varnum Pl', ' Varnum Pl NE') WHERE number_and_street LIKE '% Varnum Pl';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Belmont St', ' Belmont St NW') WHERE number_and_street LIKE '% Belmont St';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, '1400 New York Ave #', '1400 New York Ave NW #') WHERE number_and_street LIKE '%1400 New York Ave #%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, '1600 Maryland Ave NW', '1600 Maryland Ave NE') WHERE number_and_street LIKE '%1600 Maryland Ave NW%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, 'Gainsville Street apt', 'Gainesville Street SE Apt') WHERE number_and_street LIKE '%Gainsville Street apt%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, '405A Woodcrest', '405 Woodcrest') WHERE number_and_street LIKE '%405A Woodcrest%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, ' Arian St', ' Adrian St') WHERE number_and_street LIKE '% Arian St%';
UPDATE contributions SET number_and_street = REPLACE(number_and_street, '1629 Columbia Rd Apt', '1629 Columbia Rd NW Apt') WHERE number_and_street LIKE '%1629 Columbia Rd Apt%';
UPDATE contributions SET number_and_street = '1301 M Street NW, Apt. 1003' WHERE number_and_street = '1301 M Street, Apt. 1003';
UPDATE contributions SET number_and_street = '1500 Massachusetts Ave NW Apt 546' WHERE number_and_street = '1500 Massachusetts Ave Apt 546';
UPDATE contributions SET number_and_street = '3700 O St NW' WHERE number_and_street = 'Alumni Square 78, 3700 O St NW';
UPDATE contributions SET number_and_street = '45 Sutton Square SW' WHERE number_and_street = 'Vio 45 sutton Square sw';
UPDATE contributions SET number_and_street = '1504 Upshur St NW' WHERE number_and_street = '1504 upshur nw';
UPDATE contributions SET number_and_street = number_and_street || ' NE' WHERE number_and_street = '653 Anacostia Avenue';
UPDATE contributions SET number_and_street = '1301 SOUTH CAROLINA AVENUE SE' WHERE number_and_street = '1301 SOUTH CAROLINA AVENUE ...';
UPDATE contributions SET number_and_street = '1120 Rhode Island Avenue NW' WHERE number_and_street = '1120 Rhode Island Avenue, N...';
UPDATE contributions SET number_and_street = '3612 Austin St SE' WHERE number_and_street LIKE '3612 Austin%' AND contributor_last_name = 'Capozzi';
UPDATE contributions SET number_and_street = '3309 4th St SE' WHERE number_and_street = '3309 4th St SW' AND contributor_last_name = 'Batchelor';
UPDATE contributions SET contributor_middle_name = 'Mitchell' WHERE number_and_street LIKE '910 M St%' AND contributor_last_name = 'Grossman' AND contributor_first_name = 'Jordan';
UPDATE contributions SET contributor_middle_name = 'Brinn' WHERE number_and_street LIKE '7026 Longwood%' AND contributor_last_name = 'Siegel' AND contributor_first_name = 'Susan';
UPDATE contributions SET contributor_middle_name = 'Levin' WHERE number_and_street LIKE '715 6th%' AND contributor_last_name = 'Welan' AND contributor_first_name = 'Joy';
UPDATE contributions SET contributor_middle_name = 'L' WHERE number_and_street LIKE '916 Spruce%' AND contributor_last_name = 'Benjamin' AND contributor_first_name = 'Michael';
UPDATE contributions SET contributor_last_name = 'Teutsch' WHERE contributor_last_name = 'Teutsh';

UPDATE contributions SET state = 'DC' WHERE state LIKE 'Dist%Col%';
UPDATE contributions SET state = 'DC' WHERE state = 'MD' AND (city LIKE 'Washington' OR city LIKE 'Washington DC') AND SUBSTR(number_and_street, -3) IN (' NE', ' NW', 'SE', ' SW');
UPDATE contributions SET city = 'Columbus', state = 'OH' WHERE city = 'WashingtonColumbus' AND state = 'DC';
UPDATE contributions SET city = 'Washington' WHERE state = 'DC' AND (city LIKE 'Was%' OR city LIKE '%Wsa%' OR city LIKE 'Wsh%' OR city LIKE 'Wah%' OR
    city LIKE 'Wadh%' OR city LIKE 'Waas%' OR city = 'DC')AND city <> 'Washington';
UPDATE contributions SET state = 'DC' WHERE state = '' AND city LIKE 'Was%';

UPDATE committee_extras SET is_special = 1 WHERE committee_name = 'Evans Ward 2';
UPDATE committee_extras SET is_special = 1 WHERE committee_name LIKE '%Special%';
UPDATE committee_extras SET is_special = 0 WHERE is_special IS NULL;
UPDATE committee_extras SET is_running = 1 WHERE is_running IS NULL;

UPDATE contributions SET contributor_type = 'Candidate' WHERE contributor_last_name = 'Grossman' AND contributor_first_name = 'Seth' AND amount < 2000;

UPDATE committees SET office = 'Council Ward 2 (Special)' WHERE office = 'Council Ward 2' AND election_year = 2020 AND committee_name like '%Special%';
UPDATE committees SET candidate_short_name = 'C Henderson' WHERE candidate_name = 'Christina Henderson' AND election_year = 2020;
UPDATE committees SET candidate_short_name = 'K Henderson' WHERE candidate_name = 'Kathy Henderson' AND election_year = 2020;
UPDATE committees SET candidate_name = 'James Butler', candidate_short_name = 'Butler' WHERE committee_name = 'Butler Mayoral Exploratory Committee';
UPDATE committees SET candidate_short_name = 'T White' WHERE candidate_name = 'Trayon White' AND election_year = 2022;
UPDATE committees SET candidate_short_name = 'R White' WHERE candidate_name = 'Robert White' AND election_year = 2022;
UPDATE committees SET candidate_name = 'Phil Thomas' WHERE candidate_name = 'William Thomas' AND election_year = 2022;
UPDATE committees SET candidate_name = 'Isa Sanchez', candidate_short_name = 'Sanchez' WHERE candidate_name = 'Isabella Pimienta' AND election_year = 2022;
UPDATE committees SET candidate_name = 'Nina O''Neill', candidate_short_name = 'O''Neill' WHERE candidate_name = 'Nina ONeill';

UPDATE committees SET election_year = 2024 WHERE committee_name IN ('Ward 1 Residents for Brianne', 'The Committee to Recall Brianne Nadeau')
    AND election_year = 2021;
UPDATE committees SET candidate_short_name = 'Yes' WHERE committee_name IN ('The Committee to Recall Brianne Nadeau', 'Committee to Recall Charles Allen');
UPDATE committees SET candidate_short_name = 'No' WHERE committee_name IN ('Neighbors United for Ward 6', 'No Recall in WARD 6', 'Ward 1 Residents for Brianne');

DELETE FROM committees WHERE candidate_name = 'Karl Racine' AND election_year = 2022;

DELETE FROM contributions WHERE committee_name = 'Patrick Kennedy for Ward 2' AND receipt_date = '2020-03-24' AND amount > 54000;

DELETE FROM contributions WHERE committee_name = 'Committee to Elect Kathy Henderson' AND receipt_date < '2011-01-01';
DELETE FROM contributions WHERE committee_name = 'The Committee to Elect Perry Redd' AND receipt_date < '2015-01-01';

DELETE FROM contributions WHERE id IN
    (SELECT id FROM
        (SELECT normalized, receipt_date, amount, COUNT(*), MAX(id) AS id FROM contributions
        WHERE committee_name = 'Committee to Elect Sabel Harris' GROUP BY 1, 2, 3 HAVING COUNT(*) > 1)
    );
