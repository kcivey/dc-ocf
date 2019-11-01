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
      text-align: left;
      font-size: 1.2rem;
      background-color: ivory;
      border-left: 1px solid ivory;
      border-right: 1px solid ivory;
      border-top: none;
    }
    #candidate-table th.party-head {
      background-color: #ccf;
      text-align: left;
    }
    #candidate-table th.office-head {
      background-color: #eef;
      text-align: left;
      padding-left: 1.75rem;
    }
    #candidate-table td:first-child {
      padding-left: 2.75rem;
    }
    tr.details td {
      border-top: none;
    }
    tr.spacer td {
      height: 3rem;
      background: ivory;
      border-left: 1px solid ivory;
      border-right: 1px solid ivory;
    }
    tr.column-heads th {
      vertical-align: bottom;
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
      padding: 0.75rem;
    }
  </style>
</head>
<body>
<div class="container-fluid">
  <div class="row">
    <div class="col-12">
      <h1>DC 2020 Candidates</h1>
      <div id="table-container">
        <div id="expand-control">
          <b>Expand all</b>
          <button id="expand-all-button" class="btn btn-outline-primary">
            <i class="fas fa-plus-square"></i>
          </button>
        </div>
        <table id="candidate-table" class="table">
        <tbody>
          <% let i = 0, cols = 8 %>
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
              <% for (const c of candidates) { %>
                <tr>
                  <td><%- c.candidate_name %></td>
                  <td>
                    <% if (c.party_abbr) { %>
                      <abbr title="<%- c.party %>">
                        <%- c.party_abbr %>
                      </abbr>
                    <% } %>
                  </td>
                  <td>
                    <% if (c.website) { %>
                      <a href="https://<%- c.website %>"><%- c.website %></a>
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
                  <td><%- c.committee_phone %></td>
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
                        <dt>Address</dt>
                        <dd><%- c.address %></dd>
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
          $('#candidate-table .details').collapse('show');
        }
        else {
          $('#candidate-table .details').collapse('hide');
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
