/* globals jQuery, L, Mustache, c3 */
jQuery(function ($) {
    const stateDefaults = {
        electionYear: '2020',
        contest: 'council-ward-2',
        candidate: 'all-candidates',
        mapType: 'points',
    };
    let map;
    let candidateLayers = {};
    let candidateColors = {};

    setUpSelect()
        .then(setUpBaseMap)
        .then(loadContest);

    function loadContest() {
        $('.leaflet-control-layers input:radio').prop('checked', false);
        return getContestData()
            .then(function (data) {
                adjustPageText(data);
                setCandidateColors(data.points);
                handlePoints(data.points);
                handleStats(data.stats);
                handleDateData(data.dateData);
                handlePlaceData(data.placeData);
            });
    }

    function setUpSelect() {
        const select = $('#contest-select')
            .on('change', loadContest);
        const state = getStateFromUrl();
        return fetch('/available.json')
            .then(response => response.json())
            .then(function (contestsByYear) {
                for (const [year, contests] of Object.entries(contestsByYear)) {
                    for (const contest of contests) {
                        const text = year + ' ' + contest;
                        const code = hyphenize(text);
                        $('<option/>').attr('value', code)
                            .text(text)
                            .appendTo(select);
                    }
                }
                select.val(state.electionYear + '-' + state.contest);
            });
    }

    function setUpBaseMap() {
        return getWardLayer()
            .then(function (wardLayer) {
                map = L.map('map', {zoomSnap: 0.5, scrollWheelZoom: false});
                L.tileLayer('https://{s}.tiles.mapbox.com/v3/kcivey.i8d7ca3k/{z}/{x}/{y}.png', {
                    attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ' +
                        '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
                        '<strong><a href="https://www.mapbox.com/map-feedback/" target="_blank">' +
                        'Improve this map</a></strong>',
                    opacity: 0.5,
                }).addTo(map);
                map.__layersControl = L.control.layers(null, [], {collapsed: false})
                    .addTo(map);
                map.addLayer(wardLayer);
                map.fitBounds(wardLayer.getBounds());
                $('.leaflet-control-layers')
                    .on('click', 'input:radio[name=mapType]', function (evt) {
                        setUrlFromForm();
                        const type = $(evt.target).val().replace(/-/g, ' '); // ugh
                        adjustLayersControl(type);
                    })
                    .on('click', 'input:radio[name=candidate]', setUrlFromForm);
                $(window).on('popstate hashchange', setFormFromUrl);
                return map;
            });
    }

    function getWardLayer() {
        return fetch('/dc-wards.json')
            .then(response => response.json())
            .then(function (wardGeoJson) {
                return L.geoJson(wardGeoJson, {
                    onEachFeature(feature, layer) {
                        layer.bindTooltip(feature.properties.name);
                    },
                    fillColor: 'transparent', // need a fill so the tooltip works
                });
            });
    }

    function getContestData() {
        const state = setUrlFromForm();
        const url = `/ocf-${state.electionYear}-${state.contest}.json`;
        return fetch(url, {cache: 'no-cache'}).then(response => response.json());
    }

    function adjustPageText({ward, contest, extras, updated}) {
        const title = 'DC Campaign Contributions<br>' +
            $('#contest-select').find('option:selected').text().trim();
        $('h1').html(title);
        $('title').text(title.replace('<br>', ' '));
        $('#updated').text(updated);
        $('.extra').each(function () {
            const div = $(this);
            const key = div.attr('id').replace('extra-', '');
            if (extras[key]) {
                div.html(extras[key]).show();
            }
            else {
                div.html('').hide();
            }
        });
        $('.ward-specific').toggle(!!ward);
        $('.container-fluid').css('visibility', 'visible');
        $('#loader').hide();
    }

    function setCandidateColors(points) {
        const colors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628'];
        candidateColors = {};
        let i = 0;
        for (const candidate of Object.keys(points)) {
            candidateColors[candidate] = colors[i];
            i++;
        }
    }

    function handlePoints(points) {
        const baseRadius = 2.5;
        const heatMapOptions = {
            gradient: {
                0.4: 'blue',
                0.6: 'cyan',
                0.8: 'yellow',
                1.0: 'red',
            },
        };
        const clusterOptions = {
            maxClusterRadius: 60,
        };
        const allLabel = 'All candidates';
        candidateLayers = {
            'points': {
                [allLabel]: L.layerGroup(),
            },
            'clusters': {
                [allLabel]: L.markerClusterGroup(clusterOptions),
            },
            'heat map': {
                [allLabel]: L.heatLayer([], heatMapOptions),
            },
        };
        for (const [candidate, candidatePoints] of Object.entries(points)) {
            const pointOptions = {
                weight: 2,
                color: candidateColors[candidate],
                radius: baseRadius,
                fillOpacity: 0.3,
            };
            const pointsForHeatMap = [];
            const layer = L.layerGroup();
            const clusterLayer = L.markerClusterGroup(clusterOptions);
            for (const [latitude, longitude, contributors] of candidatePoints) {
                const position = [latitude, longitude];
                L.circleMarker(
                    position,
                    {...pointOptions, radius: baseRadius * (contributors ** 0.5)},
                ).addTo(layer);
                for (let contributorIndex = 0; contributorIndex < contributors; contributorIndex++) {
                    L.circleMarker(position, pointOptions)
                        .addTo(clusterLayer);
                    candidateLayers['heat map'][allLabel].addLatLng(position);
                    pointsForHeatMap.push(position);
                }
            }
            candidateLayers['points'][candidate] = layer;
            candidateLayers['points'][allLabel].addLayer(layer);
            candidateLayers['clusters'][candidate] = clusterLayer;
            candidateLayers['clusters'][allLabel].addLayer(clusterLayer);
            candidateLayers['heat map'][candidate] = L.heatLayer(pointsForHeatMap, heatMapOptions);
        }
        const state = setFormFromUrl();
        const candidate = Object.keys(candidateLayers['points'])
            .find(name => hyphenize(name) === state.candidate); // ugh
        const mapType = state.mapType.replace(/-/g, ' '); // also ugh
        adjustLayersControl(mapType, candidate);
    }

    function removeLayersFromControl() {
        const layersControl = map.__layersControl;
        const layers = [...layersControl._layers]; // clone because removing Layers modifies it
        for (const {layer} of layers) {
            layersControl.removeLayer(layer);
            map.removeLayer(layer);
            if (layer instanceof L.LayerGroup) {
                layer.eachLayer(sublayer => map.removeLayer(sublayer));
            }
        }
    }

    function adjustLayersControl(wantedType, wantedCandidate = '') {
        const overlaysContainer = $('.leaflet-control-layers-overlays');
        if (!wantedCandidate) {
            let input = $('input:radio:checked', overlaysContainer);
            if (!input.length) {
                input = $('input:radio', overlaysContainer).eq(0);
            }
            wantedCandidate = input.closest('label').text().trim();
        }
        removeLayersFromControl();
        const layersControl = map.__layersControl;
        for (const [type, layerMap] of Object.entries(candidateLayers)) {
            if (type === wantedType) {
                for (const [name, layer] of Object.entries(layerMap)) {
                    layersControl.addOverlay(layer, name);
                }
                break;
            }
        }
        $('label', overlaysContainer).each(function (i, label) {
            const candidate = $(label).text().trim();
            const value = hyphenize(candidate);
            const color = candidateColors[candidate] || '';
            $(label).css('color', color)
                .find('input')
                .attr({type: 'radio', name: 'candidate', value});
        });
        if ($('#type-radios').length === 0) {
            makeTypeRadios(wantedType);
        }
        const wantedCandidateCode = hyphenize(wantedCandidate);
        const input = $(`input:radio[value="${wantedCandidateCode}"]`, overlaysContainer);
        if (!input.prop('checked')) {
            input.trigger('click');
        }
    }

    function makeTypeRadios(wantedType) {
        const overlaysContainer = $('.leaflet-control-layers-overlays');
        const baseRadioLabel = $('label', overlaysContainer).eq(0);
        const radioDiv = $('<div/>').attr({id: 'type-radios'}).append(
            Object.keys(candidateLayers).map(function (key) {
                return baseRadioLabel.clone()
                    .find('span').text(`Display as ${key}`).end()
                    .find('input').attr({name: 'mapType', value: hyphenize(key)}).end();
            })
        );
        overlaysContainer.after(
            $('<div/>').addClass('leaflet-control-layers-separator'),
            radioDiv,
        );
        const wantedTypeCode = hyphenize(wantedType);
        $(`#type-radios input:radio[value=${wantedTypeCode}]`).prop('checked', true);
    }

    function handleStats(stats) {
        const tableContent = Mustache.render($('#table-content-template').html(), stats);
        $('#stats-table').html(tableContent);
        transposeTable('#stats-table');
        adjustTableForRotatedHeads('#stats-table');
    }

    function handleDateData({start, end, contributors}) {
        const dateColumn = ['date'];
        let i = 0;
        const dateTicks = [];
        for (let date = start; date <= end; date = incrementDate(date)) {
            dateColumn.push(date);
            if (i % 10 === 0) {
                dateTicks.push(date);
            }
            i++;
        }
        $('.ward-specific').toggle(contributors.hasOwnProperty('ward'));
        for (const [key, columns] of Object.entries(contributors)) {
            columns.unshift(dateColumn);
            c3.generate({
                bindto: '#date-chart-' + key,
                data: {
                    x: 'date',
                    type: 'line',
                    colors: candidateColors,
                    columns,
                },
                padding: {
                    right: 10,
                },
                point: {
                    show: false,
                    sensitivity: 100,
                },
                axis: {
                    x: {
                        label: {
                            text: 'Date',
                            position: 'outer-center',
                        },
                        type: 'timeseries',
                        tick: {
                            outer: false,
                            values: dateTicks,
                        },
                    },
                    y: {
                        label: {
                            text: 'Number of Contributors',
                            position: 'outer-middle',
                        },
                        padding: 0,
                        tick: {
                            outer: false,
                        },
                    },
                },
            });
        }

        function incrementDate(date) {
            const timestamp = new Date(date).getTime();
            return new Date(timestamp + 86400000).toISOString().substr(0, 10);
        }
    }

    function handlePlaceData(placeData) {
        const container = $('#place-chart-container');
        container.empty();
        const html = $('#place-chart-div-template').html();
        Mustache.parse(html);
        for (const c of placeData) {
            $(Mustache.render(html, c)).appendTo(container);
            for (const type of ['state', 'ward']) {
                const selector = `#place-chart-${type}-${c.code}`;
                let chart = null;
                const pieResizeHandler = function () {
                    const width = $(selector).innerWidth();
                    chart.resize({
                        height: width * 0.9,
                    });
                };
                chart = c3.generate({
                    bindto: selector,
                    data: {
                        colors: c[type].colors,
                        columns: c[type].columns,
                        type: 'pie',
                        order: null,
                    },
                    onresize: pieResizeHandler,
                });
                pieResizeHandler();
            }
        }
    }

    function setUrlFromForm() {
        const checkedRadios = $('.leaflet-control-layers input:radio:checked').get();
        const state = {...stateDefaults};
        const m = $('#contest-select').val().match(/^(\d+)-(.+)/);
        state.electionYear = m[1];
        state.contest = m[2];
        for (const radio of checkedRadios) {
            const name = $(radio).attr('name');
            state[name] = $(radio).val();
        }
        let suffix = Object.values(state).join('/');
        if (suffix === Object.values(stateDefaults).join('/')) {
            suffix = '';
        }
        const currentUrl = window.location.href;
        const currentHash = window.location.hash;
        const baseUrl = currentUrl.replace(/^(https?:\/\/[^/]+\/[^\/#]+).*/, '$1');
        const usePushState = window.history.pushState && !/localhost/.test(baseUrl);
        let newUrl = baseUrl;
        if (usePushState) {
            newUrl += (suffix ? '/' + suffix : '') + (currentHash ? '#' + currentHash : '');
        }
        else {
            newUrl += (suffix ? '#/' + suffix : '');
        }
        if (newUrl !== currentUrl) {
            if (usePushState) {
                window.history.pushState(state, '', newUrl);
            }
            else {
                window.location.hash = '/' + suffix;
            }
        }
        return state;
    }

    function getStateFromUrl() {
        const suffix = window.location.href
            .replace(/^https?:\/\/[^\/]+\/[^\/#]+[\/#]*/, '');
        const parts = suffix.split('/');
        const state = {...stateDefaults};
        let i = 0;
        for (const key of Object.keys(state)) {
            state[key] = parts[i] || stateDefaults[key];
            i++;
        }
        return state;
    }

    function setFormFromUrl() {
        const state = getStateFromUrl();
        const yearContestCode = state.electionYear + '-' + state.contest;
        const select = $('#contest-select');
        if (select.val() !== yearContestCode) {
            $('#contest-select').val(yearContestCode)
                .trigger('change');
        }
        const div = $('.leaflet-control-layers');
        for (const [name, value] of Object.entries(state)) {
            const input = div.find(`input[name="${name}"][value="${value}"]`);
            if (input.length && !input.prop('checked')) {
                input.trigger('click');
            }
        }
        return state;
    }

    function transposeTable(table) {
        const $table = $(table);
        $table.find('th').each(function () { // strip out markup for rotated heads
            $(this).removeClass('rotate')
                .html($(this).find('span').html());
        });
        const newrows = [];
        $table.find('tr').each(function () {
            $(this).children().each(function (i) {
                if ($(this).hasClass('spacer')) {
                    return;
                }
                if (newrows[i] === undefined) {
                    newrows[i] = $('<tr/>');
                }
                newrows[i].append(this);
            });
        });
        $table.find('tr').remove();
        const $tbody = $table.find('tbody');
        $.each(newrows, function (i) {
            if (i === 0) {
                $table.find('thead').append(this);
            }
            else {
                $tbody.append(this);
            }
        });
    }

    function adjustTableForRotatedHeads(table) {
        const $table = $(table);
        const heads = $table.find('thead th');
        heads.addClass('rotate')
            .wrapInner('<div><span></span></div>');
        let headHeight = 0;
        let lastHeadWidth = 0;
        heads.find('span').each(function () {
            const width = $(this).width();
            const height = $(this).height();
            const rad = 45 * Math.PI / 180;
            const sin = Math.sin(rad);
            const cos = Math.cos(rad);
            const actualWidth = Math.abs(width * cos) + Math.abs(height * sin);
            const actualHeight = Math.abs(width * sin) + Math.abs(height * cos);
            if (actualHeight > headHeight) {
                headHeight = actualHeight;
            }
            lastHeadWidth = actualWidth;
        });
        heads.height(headHeight);
        const lastColumnWidth = $table.find('tbody tr').first().find('td').last().width();
        if (lastHeadWidth > lastColumnWidth) {
            const cell = `<td style="width: ${Math.ceil(lastHeadWidth - lastColumnWidth) + 4}px"></td>`;
            $table.find('tr').append(cell);
        }
    }

    function hyphenize(s) {
        return s.replace(/([a-z])(?=[A-Z])/g, '$1-')
            .toLowerCase()
            .replace(/[^a-z\d]+/g, '-')
            .replace(/^-|-$/g, '');
    }

});
