/**
 * Copyright 2019 Keith C. Ivey
 * keith@iveys.org
 * https://dcgeekery.com
 * ISC License
 * Source: https://github/kcivey/dc-ocf
 */
/* globals jQuery, L, Mustache, c3 */
/* eslint-disable no-restricted-properties */
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
    let setFormFromUrlBeingCalled = false; // kluge

    setUpSelect()
        .then(getWardLayer)
        .then(setUpBaseMap)
        .then(loadContest);

    function loadContest(evt) {
        if (evt && evt.target) { // called as an event handler
            $('#layers-control').find('input')
                .prop('checked', false);
            setUrlFromForm();
        }
        return getContestData()
            .then(function (data) {
                adjustPageText(data);
                setCandidateColors(data.points);
                handlePoints(data.points);
                handleStats(data.stats);
                handleDateData(data.dateData);
                handlePlaceData(data.placeData);
                $('#contest-select').on('change', loadContest);
            });
    }

    function setUpSelect() {
        const select = $('#contest-select');
        const state = getStateFromUrl();
        return $.getJSON('/available.json')
            .then(function (contestsByYear) {
                $.each(contestsByYear, function (year, contests) {
                    $.each(contests, function (i, contest) {
                        const text = year + ' ' + contest;
                        const code = hyphenize(text);
                        $('<option/>').attr('value', code)
                            .text(text)
                            .appendTo(select);
                    });
                });
                select.val(state.electionYear + '-' + state.contest);
            });
    }

    function setUpBaseMap(wardLayer) {
        map = L.map('map', {zoomSnap: 0.5, scrollWheelZoom: false});
        L.tileLayer('https://{s}.tiles.mapbox.com/v3/kcivey.i8d7ca3k/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ' +
                '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
                '<strong><a href="https://www.mapbox.com/map-feedback/" target="_blank">' +
                'Improve this map</a></strong>',
            opacity: 0.5,
        }).addTo(map);
        const layersControl = L.control.layers(null, [], {collapsed: false});
        map.__layersControl = layersControl.addTo(map);
        $('#layers-control').append(layersControl.getContainer())
            .on('click', 'input:radio[name=mapType]', mapTypeHandler)
            .on('click', 'input:radio[name=candidate]', setUrlFromForm);
        map.addLayer(wardLayer);
        map.fitBounds(wardLayer.getBounds());
        $(window).on('popstate hashchange', setFormFromUrl);
        setUpViewportHandler();
        return map;
    }

    function mapTypeHandler(evt) {
        setUrlFromForm();
        const type = $(evt.target).val()
            .replace(/-/g, ' '); // ugh
        adjustLayersControl(type);
    }

    function setUpViewportHandler(map) {
        if (!window.visualViewport || L.Browser.touch) {
            return;
        }
        let pendingViewportEvent = false;
        window.visualViewport.addEventListener('scroll', viewportHandler);
        window.visualViewport.addEventListener('resize', viewportHandler);
        window.addEventListener('scroll', viewportHandler);

        function viewportHandler() {
            // If the page is too zoomed in only mobile, the map can fill the viewport,
            // which makes it impossible to zoom or scroll the page. This should
            // prevent that. It depends on a visualViewport polyfill.
            if (pendingViewportEvent) {
                return;
            }
            pendingViewportEvent = true;
            const viewport = window.visualViewport;
            const mapBBox = map.getContainer().getBoundingClientRect();
            // Scroll to top if map takes up whole viewport or almost all
            const padding = 20;
            if (mapBBox.left - padding <= viewport.offsetLeft &&
                mapBBox.top - padding <= viewport.offsetTop &&
                mapBBox.right + padding >= viewport.offsetLeft + viewport.width &&
                mapBBox.bottom + padding >= viewport.offsetTop + viewport.height) {
                window.scroll(0, 0);
            }
            setTimeout(() => pendingViewportEvent = false, 0);
        }
    }

    function getWardLayer() {
        return $.getJSON('/dc-wards.json')
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
        const state = getStateFromUrl();
        const url = `/ocf-${state.electionYear}-${state.contest}.json`;
        return $.getJSON(url);
    }

    function adjustPageText({ward, extras, updated, allFairElections}) {
        const title = 'DC Campaign Contributions<br>' +
            $('#contest-select').find('option:selected')
                .text()
                .trim();
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
        $('.citywide-specific').toggle(!ward);
        $('.not-all-fair-elections').toggle(!allFairElections);
        $('.container-fluid').css('visibility', 'visible');
        $('.loader').hide();
    }

    function setCandidateColors(points) {
        const colors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628'];
        candidateColors = {};
        let i = 0;
        $.each(points, function (candidate) {
            candidateColors[candidate] = colors[i];
            i++;
        });
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
        $.each(points, function (candidate, candidatePoints) {
            const pointOptions = {
                weight: 2,
                color: candidateColors[candidate],
                radius: baseRadius,
                fillOpacity: 0.3,
            };
            const pointsForHeatMap = [];
            const layer = L.layerGroup();
            const clusterLayer = L.markerClusterGroup(clusterOptions);
            $.each(candidatePoints, function (i, point) {
                const position = [point[0], point[1]];
                const contributors = point[2];
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
            });
            candidateLayers['points'][candidate] = layer;
            candidateLayers['points'][allLabel].addLayer(layer);
            candidateLayers['clusters'][candidate] = clusterLayer;
            candidateLayers['clusters'][allLabel].addLayer(clusterLayer);
            candidateLayers['heat map'][candidate] = L.heatLayer(pointsForHeatMap, heatMapOptions);
        });
        const state = getStateFromUrl();
        const candidate = Object.keys(candidateLayers['points'])
            .find(name => hyphenize(name) === state.candidate); // ugh
        const mapType = state.mapType.replace(/-/g, ' '); // also ugh
        adjustLayersControl(mapType, candidate);
        setFormFromUrl();
    }

    function removeLayersFromControl() {
        const layersControl = map.__layersControl;
        const layers = [...layersControl._layers]; // clone because removing layers modifies it
        $.each(layers, function (i, obj) {
            const layer = obj.layer;
            layersControl.removeLayer(layer);
            map.removeLayer(layer);
            if (layer instanceof L.LayerGroup) {
                layer.eachLayer(sublayer => map.removeLayer(sublayer));
            }
        });
    }

    function adjustLayersControl(wantedType, wantedCandidate = '') {
        const overlaysContainer = $('.leaflet-control-layers-overlays');
        if (!wantedCandidate) {
            let input = $('input:radio:checked', overlaysContainer);
            if (!input.length) {
                input = $('input:radio', overlaysContainer).eq(0);
            }
            wantedCandidate = input.closest('label')
                .text()
                .trim();
        }
        removeLayersFromControl();
        const layersControl = map.__layersControl;
        $.each(candidateLayers, function (type, layerMap) {
            if (type === wantedType) {
                $.each(layerMap, function (name, layer) {
                    layersControl.addOverlay(layer, name);
                });
            }
        });
        $('label', overlaysContainer).each(function (i, label) {
            const candidate = $(label).text()
                .trim();
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
        const radioDiv = $('<div/>').attr({id: 'type-radios'})
            .append(
                Object.keys(candidateLayers).map(function (key) {
                    return baseRadioLabel.clone()
                        .find('span')
                        .text(`Display as ${key}`)
                        .end()
                        .find('input')
                        .attr({name: 'mapType', value: hyphenize(key)})
                        .end();
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
        $('#stats-table').html(tableContent)
            .find('th[title]')
            .tooltip({container: 'body', boundary: 'viewport'});
        adjustTableForRotatedHeads('#stats-table');
    }

    function handleDateData({start, end, contributors}) {
        const dateColumn = ['date'];
        let i = 0;
        const dateTicks = [];
        for (let date = start; date <= end; date = incrementDate(date)) {
            dateColumn.push(date);
            if (i % 14 === 0) {
                dateTicks.push(date);
            }
            i++;
        }
        $('.ward-specific').toggle(!!contributors.ward);
        $.each(contributors, function (key, columns) {
            for (const column of columns) {
                // change initial 0s to null so they don't show on chart
                let i = 1;
                while (column[i] === 0) {
                    if (column[i + 1] === 0) {
                        column[i] = null;
                    }
                    i++;
                }
            }
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
        });

        function incrementDate(date) {
            const timestamp = new Date(date).getTime();
            return new Date(timestamp + 86400000).toISOString()
                .substr(0, 10);
        }
    }

    function handlePlaceData(placeData) {
        const container = $('#place-chart-container');
        container.empty();
        const html = $('#place-chart-div-template').html();
        Mustache.parse(html);
        $.each(placeData, function (i, c) {
            $(Mustache.render(html, c)).appendTo(container);
            $.each(['state', 'ward'], function (i, type) {
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
            });
        });
    }

    function setUrlFromForm() {
        const checkedRadios = $('.leaflet-control-layers input:radio:checked').get();
        const state = {...stateDefaults};
        const m = $('#contest-select').val()
            .match(/^(\d+)-(.+)/);
        state.electionYear = m[1];
        state.contest = m[2];
        $.each(checkedRadios, function (i, radio) {
            const name = $(radio).attr('name');
            state[name] = $(radio).val();
        });
        let suffix = Object.values(state).join('/');
        if (suffix === Object.values(stateDefaults).join('/')) {
            suffix = '';
        }
        const currentUrl = window.location.href;
        const currentHash = window.location.hash;
        const baseUrl = currentUrl.replace(/^(https?:\/\/[^/]+\/[^/#]+).*/, '$1');
        const usePushState = window.history && window.history.pushState && !/localhost/.test(baseUrl);
        let newUrl = baseUrl;
        if (usePushState) {
            if (suffix) {
                newUrl += '/' + suffix;
            }
            if (currentHash && !currentHash.includes('/')) {
                newUrl += '#' + currentHash;
            }
        }
        else if (suffix) {
            newUrl += '#/' + suffix;
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
            .replace(/^https?:\/\/[^/]+\/[^/#]+[/#]*/, '');
        const parts = suffix.split('/');
        const state = {...stateDefaults};
        let i = 0;
        $.each(state, function (key) {
            state[key] = parts[i] || stateDefaults[key];
            i++;
        });
        return state;
    }

    function setFormFromUrl() {
        const state = getStateFromUrl();
        if (!setFormFromUrlBeingCalled) {
            setFormFromUrlBeingCalled = true;
            const yearContestCode = state.electionYear + '-' + state.contest;
            const select = $('#contest-select');
            if (select.val() !== yearContestCode) {
                select.val(yearContestCode)
                    .trigger('change');
            }
            const div = $('#layers-control');
            $.each(state, function (name, value) {
                const input = div.find(`input[name="${name}"][value="${value}"]`);
                if (input.length && !input.prop('checked')) {
                    input.trigger('click');
                }
            });
            setFormFromUrlBeingCalled = false;
        }
        return state;
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
        const lastColumnWidth = $table.find('tbody tr')
            .first()
            .find('td')
            .last()
            .width();
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
