CREATE TABLE `contributions` (
    `id` int(10) unsigned NOT NULL auto_increment,
    `committee_name` varchar(255) NOT NULL,
    `candidate_name` varchar(255) NOT NULL,
    `contributor` varchar(255) NOT NULL,
    `address` varchar(255) NOT NULL,
    `city` varchar(255) NOT NULL,
    `state` varchar(255) NOT NULL,
    `zip` varchar(255) NOT NULL,
    `contributor_type` varchar(255) NOT NULL,
    `contribution_type` varchar(255) NOT NULL,
    `employer_name` varchar(255) NOT NULL,
    `employer_address` varchar(255) NOT NULL,
    `amount` decimal(8,2) NOT NULL,
    `date_of_receipt` date NOT NULL,
    `election_year` year(4) NOT NULL,
    PRIMARY KEY  (`id`),
    KEY `committee_name` (`committee_name`),
    KEY `date_of_receipt` (`date_of_receipt`),
    KEY `election_year` (`election_year`)
);

CREATE TABLE `committees` (
    `id` int(10) unsigned NOT NULL,
    `year` year(4) NOT NULL,
    `committee` varchar(255) NOT NULL,
    `candidate` varchar(255) NOT NULL,
    `office` varchar(255) NOT NULL,
    `party` varchar(255) NOT NULL,
    `filing_date` date NOT NULL,
    `url` varchar(255) NOT NULL,
    `incumbent` tinyint(1) unsigned NOT NULL,
    UNIQUE KEY (`id`),
    KEY `committee` (`committee`)
);
