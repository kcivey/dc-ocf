/* globals jQuery, L, Mustache, c3 */
jQuery(function ($) {
    const candidateColors = {};
    let wardLayer;
    const stateDefaults = {
        electionYear: '2020',
        contest: 'council-at-large',
        candidate: 'all-candidates',
        mapType: 'points',
    };
    fetch('/dc-wards.json')
        .then(response => response.json())
        .then(function (wardGeoJson) {
            wardLayer = L.geoJson(wardGeoJson, {
                onEachFeature(feature, layer) {
                    layer.bindTooltip(feature.properties.name);
                },
                fillColor: 'transparent', // need a fill so the tooltip works
            });
        })
        .then(() => fetch('/ocf-2020-council-ward-2.json'))
        .then(response => response.json())
        .then(function ({points, stats, dateData, placeData}) {
            handlePoints(points);
            handleStats(stats);
            handleDateData(dateData);
            handlePlaceData(placeData);
        });

    function handlePoints(points) {
        const map = L.map('map', {zoomSnap: 0.5, scrollWheelZoom: false});
        L.tileLayer('https://{s}.tiles.mapbox.com/v3/kcivey.i8d7ca3k/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ' +
                '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
                '<strong><a href="https://www.mapbox.com/map-feedback/" target="_blank">' +
                'Improve this map</a></strong>',
            opacity: 0.5,
        }).addTo(map);
        map.addLayer(wardLayer);
        const colors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628'];
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
        const candidateLayers = {
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
        let candidateIndex = 0;
        for (const [candidate, candidatePoints] of Object.entries(points)) {
            candidateColors[candidate] = colors[candidateIndex];
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
            candidateIndex++;
        }
        const layersControl = L.control.layers(null, candidateLayers['points'], {collapsed: false})
            .addTo(map);
        map.fitBounds(wardLayer.getBounds());
        $('.leaflet-control-layers').on('click', '#type-radios', function () {
            const type = $('input:radio:checked', this).val();
            adjustLayersControl(type);
        }).on('click', 'input:radio', () => setTimeout(setUrlFromForm, 0)); // timeout to allow radios to be adjusted
        $(window).on('popstate', setFormFromUrl);
        const state = setFormFromUrl();
        adjustLayersControl(state.mapType, state.candidate);
        setUpResizeHandler();

        function adjustLayersControl(wantedType, wantedCandidate) {
            const overlaysContainer = $('.leaflet-control-layers-overlays');
            if (!wantedCandidate) {
                wantedCandidate = $('input:radio:checked', overlaysContainer).val() ||
                    $('input:radio', overlaysContainer).eq(0).val();
            }
            for (const [type, layerMap] of Object.entries(candidateLayers)) {
                for (const layer of Object.values(layerMap)) {
                    layersControl.removeLayer(layer);
                    map.removeLayer(layer);
                }
                if (hyphenize(type) === wantedType) {
                    for (const [name, layer] of Object.entries(layerMap)) {
                        layersControl.addOverlay(layer, name);
                    }
                }
            }
            let baseRadioLabel;
            $('label', overlaysContainer).each(function (i, label) {
                const value = hyphenize($(label).text());
                $(label).find('input')
                    .attr({type: 'radio', name: 'candidate', value});
                if (i < 1) {
                    return;
                }
                if (!baseRadioLabel) {
                    baseRadioLabel = $(label);
                }
                const color = colors[i - 1] || '';
                $(label).css('color', color);
            });
            if ($('#type-radios').length === 0) {
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
                $(`#type-radios input:radio[value=${wantedType}]`).prop('checked', true);
            }
            $(`input:radio[value="${wantedCandidate}"]`, overlaysContainer)
                .trigger('click');
        }

        function setUpResizeHandler() {
            const mapDiv = $('#map');
            let prevWidth = mapDiv.width();
            let prevHeight = mapDiv.height();
            setInterval(function () {
                const width = mapDiv.width();
                const height = mapDiv.height();
                if (width !== prevWidth || height !== prevHeight) {
                    map.invalidateSize({debounceMoveend: true, pan: false});
                    prevWidth = width;
                    prevHeight = height;
                }
            }, 250);
        }
    }

    function handleStats(stats) {
        const tableContent = Mustache.render($('#table-content-template').html(), stats);
        $('#stats-table').html(tableContent);
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
        if (!contributors.hasOwnProperty('ward')) {
            $('.ward-specific').hide();
        }
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
        const html = $('#place-chart-div-template').html();
        const colors = {
            'Other': 'lightgray',
            'Unknown Ward': '#900000',
            'Ward 1': '#a60000',
            'Ward 2': '#ff0000',
            'Ward 3': '#c00000',
            'Ward 4': '#dd0000',
            'Ward 5': '#ff2727',
            'Ward 6': '#ff5454',
            'Ward 7': '#ff8888',
            'Ward 8': '#ffc4c4',
            'MD': 'green',
            'VA': 'blue',
        };
        Mustache.parse(html);
        for (const c of placeData) {
            $(Mustache.render(html, c)).appendTo(container);
            c3.generate({
                bindto: '#place-chart-' + c.code,
                data: {
                    colors,
                    columns: c.columns,
                    type: 'pie',
                },
            });
        }
    }

    function setUrlFromForm() {
        const checkedRadios = $('.leaflet-control-layers input:radio:checked').get();
        const state = {...stateDefaults};
        for (const radio of checkedRadios) {
            const name = $(radio).attr('name');
            state[name] = $(radio).val();
        }
        const suffix = Object.values(state).join('/');
        const currentUrl = window.location.href;
        const baseUrl = currentUrl.replace(/^(https?:\/\/[^/]+\/[^\/#]+).*/, '$1');
        const newUrl = baseUrl + '/' + suffix;
        if (newUrl !== currentUrl) {
            if (window.history.pushState && !/localhost/.test(baseUrl)) {
                window.history.pushState(state, '', newUrl);
            }
            else {
                window.location.hash = suffix;
            }
        }
        return state;
    }

    function setFormFromUrl() {
        const suffix = window.location.href
            .replace(/^https?:\/\/[^\/]+\/[^\/#]+[\/#]*/, '');
        const parts = suffix.split('/');
        const state = {...stateDefaults};
        let i = 0;
        for (const key of Object.keys(state)) {
            state[key] = parts[i] || stateDefaults[key];
            i++;
        }
        const div = $('.leaflet-control-layers');
        for (const [name, value] of Object.entries(state)) {
            const input = div.find(`input[name="${name}"][value="${value}"]`);
            if (!input.prop('checked')) {
                input.trigger('click');
            }
        }
        return state;
    }

    function hyphenize(s) {
        return s.replace(/([a-z])(?=[A-Z])/g, '$1-')
            .toLowerCase()
            .replace(/[^a-z\d]+/g, '-')
            .replace(/^-|-$/g, '');
    }

});
