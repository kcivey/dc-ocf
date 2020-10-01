<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <title>DC 2020 Candidates</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha256-YLGeXaapI0/5IgZopewRJcFXomhRMlYYjugPLSyNjTY=" crossorigin="anonymous" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.8.1/css/all.min.css" integrity="sha256-7rF6RaSKyh16288E3hVdzQtHyzatA2MQRGu0cf6pqqM=" crossorigin="anonymous">
  <link rel="stylesheet" href="/index.css">
  <style type="text/css">
    #candidate-table {
      width: auto;
      background-color: white;
      color: black;
      border-left: 1px solid #dee2e6;
      border-right: 1px solid #dee2e6;
      border-bottom: 1px solid #dee2e6;
    }
    #candidate-table th.election-head {
      padding-left: 0;
      text-align: left;
      font-size: 1.2rem;
      background-color: ivory;
      border-left: 1px solid ivory;
      border-right: 1px solid ivory;
      border-top: none;
    }
    #candidate-table th.office-head {
      background-color: #eef;
      text-align: left;
    }
    #candidate-table td.candidate {
      padding-left: 1.75rem;
    }
    tr.details > td {
      padding-left: 1.75rem;
      border-top: none;
    }
    tr.spacer > td {
      height: 3rem;
      background: ivory;
      border-left: 1px solid ivory;
      border-right: 1px solid ivory;
    }
    tr.column-heads > th {
      vertical-align: bottom;
      background: #cce;
      border-bottom: 3px solid #99c;
    }
    #table-container {
      max-width: 100%;
      overflow-x: scroll;
      width: auto;
      display: inline-block;
    }
    tr.details dl {
      max-width: 40rem;
    }
    button.btn-outline-primary {
      border-color: transparent;
      padding: 0.2rem;
      line-height: 0.67;
    }
    .btn-outline-primary.focus, .btn-outline-primary:focus {
      border: 1px dotted rgba(0,123,255,.5);
      box-shadow: none;
    }
    #expand-control {
      text-align: right;
      padding: 0 0.75rem;
    }
    #intro {
      max-width: 70rem;
      columns: 2 20rem;
      column-fill: balance;
      column-gap: 2rem;
      widows: 2;
      orphans: 2;
    }
    .extra {
      background-color: #eee;
      padding: 1rem;
    }
  </style>
</head>
<body>
<div class="container-fluid">
  <div class="row">
    <div class="col-12">
      <h1>DC 2020 Candidates</h1>
      <div id="table-container">
        <div class="byline">
          Keith C. Ivey (updated <%- updated %>)
        </div>
        <div>
          <div id="expand-control" class="float-right">
            <b>Expand all</b>
            <button id="expand-all-button" class="btn btn-outline-primary">
              <i class="fas fa-plus-square"></i>
            </button>
          </div>
          <div id="intro">
            <p>
              These are the candidates who have registered with the DC Office of Campaign Finance
              or picked up nominating petitions from the Board of Elections but have not withdrawn.
              I added websites, social media accounts, electoral histories,
              and whatever news articles and other links could find.
              Send comments and corrections to keith@iveys.org or to @kcivey on Twitter.
            </p>
            <p>
              In the electoral histories, for races that have more than one winner (like those for
              council at-large), the percentages are based on the total number of ballots, since the
              Board of Elections does not release numbers for how many ballots contained votes for
              the particular race.
            </p>
            <p class="extra">
              I also have <a href="/dc-campaign-finance">analysis of campaign finance data for these races</a>.
              For the at-large council race, Zach Teutsch is maintaining
              <a href="https://docs.google.com/spreadsheets/d/1lrN9AeLsDvVdZsdljjoIrbGbOmynHlEI1cNUQ5wHcI4/edit#gid=1913992149">a list of endorsements</a>,
              and DC Working Families has <a href="https://www.dcvoterguide.com/">a voter guide</a>.
            </p>
          </div>
        </div>
        <table id="candidate-table" class="table">
        <tbody>
          <% let i = 0, cols = 9 %>
          <%for (const [election, candidatesByOffice] of Object.entries(recordsByElection)) { %>
            <% if (i) { %>
              <tr class="spacer">
                <td colspan="<%= cols %>"></td>
              </tr>
            <% }%>
            <tr>
              <th class="election-head" colspan="<%= cols %>">
                <h2><%- election %></h2>
              </th>
            </tr>
            <tr class="column-heads">
              <th>Candidate</th>
              <th>Party</th>
              <th>Fair<br>Elections?</th>
              <th>Website</th>
              <th>Twitter</th>
              <th>Other<br>Social</th>
              <th>Phone</th>
              <th>Email</th>
              <th></th>
            </tr>
            <% for (const [office, candidates] of Object.entries(candidatesByOffice)) { %>
              <tr>
                <th class="office-head" colspan="<%= cols %>"><%- office %></th>
              </tr>
              <% for (const c of candidates) {
                  if (c.withdrew) continue;
              %>
                <tr>
                  <td class="candidate"><%- c.candidate_name %></td>
                  <td>
                    <% if (c.party_abbr) { %>
                      <abbr title="<%- c.party %>">
                        <%- c.party_abbr %>
                      </abbr>
                    <% } %>
                  </td>
                  <td class="text-center">
                    <% if (c.fair_elections) { %>
                      <i class="fas fa-balance-scale text-primary" title="Using/seeking public financing">
                        <span class="sr-only">Fair Elections</span>
                      </i>
                    <% } %>
                  </td>
                  <td>
                    <% if (c.website) { %>
                      <% var url = (/^https?:/.test(c.website) ? '' : 'https://') + c.website; %>
                      <a href="<%- url %>"><%- c.website %></a>
                    <% } %>
                  </td>
                  <td>
                    <% if (c.twitter) { %>
                      <a href="https://twitter.com/<%- c.twitter %>">@<%- c.twitter %></a>
                    <% } %>
                  </td>
                  <td>
                    <% if (c.facebook) { %>
                      <a href="https://www.facebook.com/<%- c.facebook %>" title="Facebook">
                        <i class="fab fa-facebook">
                          <span class="sr-only">Facebook</span>
                        </i>
                      </a>
                    <% } %>
                    <% if (c.instagram) { %>
                      <a href="https://www.instagram.com/<%- c.instagram %>/" title="Instagram">
                        <i class="fab fa-instagram">
                          <span class="sr-only">Instagram</span>
                        </i>
                      </a>
                    <% } %>
                  </td>
                  <td><%- c.phone || c.committee_phone %></td>
                  <td>
                    <% if (c.email) { %>
                      <a href="mailto:<%- c.email %>">
                        <%- c.email %>
                      </a>
                    <% } %>
                  </td>
                  <td class="text-right">
                    <% if (c.address) { %>
                      <button class="btn btn-outline-primary" title="Show Details" data-toggle="collapse" data-target="#details-<%= i %>">
                        <i class="fas fa-plus-square"></i>
                      </button>
                    <% } %>
                  </td>
                </tr>
                <% if (c.address) { %>
                  <tr id="details-<%= i %>" class="collapse details">
                    <td colspan="<%= Math.floor(cols / 2) %>">
                      <dl>
                        <dt>OCF filing date</dt>
                        <dd><%- c.filing_date %></dd>
                        <dt>BOE pickup date</dt>
                        <dd><%- c.boe_pickup_date %></dd>
                        <dt>BOE filing date</dt>
                        <dd><%- c.boe_filing_date %></dd>
                        <% if (c.neighborhood) { %>
                          <dt>Neighborhood</dt>
                          <dd><%- c.neighborhood %></dd>
                        <% } %>
                        <dt>Zip</dt>
                        <dd><%- c.zip %></dd>
                      </dl>
                    </td>
                    <td colspan="<%= cols - Math.floor(cols / 2) %>">
                      <% if (c.links && c.links.length) { %>
                        <dl>
                          <dt>Links</dt>
                          <dd>
                            <ul>
                              <% for (const l of c.links) { %>
                                <li>
                                  <a href="<%- l.url %>">
                                    <%- l.title %>
                                  </a>
                                </li>
                              <% } %>
                            </ul>
                          </dd>
                        </dl>
                      <% } %>
                        <% if (c.elections && c.elections.length) { %>
                          <dl>
                            <dt>Electoral history</dt>
                            <dd>
                              <table class="table table-sm">
                                <thead>
                                  <tr>
                                    <th>Year</th>
                                    <th>Election</th>
                                    <th>Party</th>
                                    <th>Office</th>
                                    <th>Result</th>
                                    <th class="text-right">%</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <% for (const e of c.elections) { %>
                                    <tr>
                                      <td><%- e.year %></td>
                                      <td><%- e.election %></td>
                                      <td>
                                        <% if (e.party_abbr) { %>
                                          <abbr title="<%- e.party %>">
                                            <%- e.party_abbr %>
                                          </abbr>
                                        <% } %>
                                      </td>
                                      <td><%= e.office %></td>
                                      <td><%- e.result %></td>
                                      <td class="text-right"><%- e.percent %></td>
                                    </tr>
                                  <% } %>
                                </tbody>
                              </table>
                            </dd>
                          </dl>
                        <% } %>
                    </td>
                  </tr>
                  <% i++ %>
                <% } %>
              <% } %>
            <% } %>
          <% } %>
        </tbody>
      </table>
      </div>
    </div>
  </div>
</div>
<%= '\x3c%= nav %\x3e' %>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.1/jquery.min.js" integrity="sha256-CSXorXvZcTkaix6Yvo6HppcZGetbYMGWSFlBw8HfCJo=" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.15.0/umd/popper.min.js" integrity="sha256-fTuUgtT7O2rqoImwjrhDgbXTKUwyxxujIMRIK7TbuNU=" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha256-CjSoeELFOcH0/uxWu6mC/Vlrc1AARqbm/jiiImDGV3s=" crossorigin="anonymous"></script>
<script>
  jQuery(function ($) {
    $('#candidate-table')
      .on('show.bs.collapse', '.details', function () {
        $(this).prev()
          .find('button')
          .prop('title', 'Hide Details')
          .find('i')
          .addClass('fa-minus-square')
          .removeClass('fa-plus-square');
      })
      .on('hidden.bs.collapse', '.details', function () {
        $(this).prev()
          .find('button')
          .prop('title', 'Show Details')
          .find('i')
          .addClass('fa-plus-square')
          .removeClass('fa-minus-square');
      });
    $('#expand-all-button')
      .on('click', function () {
        if ($(this).find('i').hasClass('fa-plus-square')) {
          $(this).find('i')
            .removeClass('fa-plus-square')
            .addClass('fa-minus-square')
            .end()
            .prev()
            .text('Collapse all');
          $('#candidate-table > tbody > tr:not(.details) > td, th.office-head')
            .css('borderTop', '1px solid #666');
          $('#candidate-table .details').collapse('show');
        }
        else {
          $('#candidate-table .details').collapse('hide');
          $('#candidate-table > tbody > tr:not(.details) > td, th.office-head')
            .css('borderTop', '1px solid #dee2e6');
          $(this).find('i')
            .removeClass('fa-minus-square')
            .addClass('fa-plus-square')
            .end()
            .prev()
            .text('Expand all');
        }
      });
  });
</script>
</body>
</html>
