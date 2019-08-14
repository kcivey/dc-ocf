/* globals jQuery, L */
jQuery(function ($) {
    let wardLayer;
    fetch('dc-wards.json')
        .then(response => response.json())
        .then(function (wardGeoJson) {
            wardLayer = L.geoJson(wardGeoJson, {
                onEachFeature(feature, layer) {
                    layer.bindTooltip(feature.properties.name);
                },
                fillColor: 'transparent', // need a fill so the tooltip works
            });
        })
        .then(() => fetch('contributors.json'))
        .then(response => response.json())
        .then(function (contributors) {
            const map = L.map('map', {zoomSnap: 0.5});
            L.tileLayer('https://{s}.tiles.mapbox.com/v3/kcivey.i8d7ca3k/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ' +
                    '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
                    '<strong><a href="https://www.mapbox.com/map-feedback/" target="_blank">' +
                    'Improve this map</a></strong>',
                opacity: 0.5,
            }).addTo(map);
            map.addLayer(wardLayer);
            const heatMapOptions = {
                gradient: {
                    0.4: 'blue',
                    0.6: 'cyan',
                    0.8: 'yellow',
                    0.98: 'red',
                    1.0: 'white',
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
            const colors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3'];
            const baseRadius = 2.5;
            let candidateIndex = 0;
            for (const [candidate, points] of Object.entries(contributors)) {
                const color = colors[candidateIndex];
                const pointsForHeatMap = [];
                const layer = L.layerGroup();
                const clusterLayer = L.markerClusterGroup(clusterOptions);
                for (const point of points) {
                    L.circleMarker(
                        point.position,
                        {
                            weight: 2,
                            color,
                            radius: baseRadius * (point.contributors ** 0.5),
                        }
                    ).addTo(layer);
                    for (let contributorIndex = 0; contributorIndex < point.contributors; contributorIndex++) {
                        L.circleMarker(
                            point.position,
                            {
                                weight: 2,
                                color,
                                radius: baseRadius,
                            }
                        ).addTo(clusterLayer);
                        candidateLayers['heat map'][allLabel].addLatLng(point.position);
                        pointsForHeatMap.push(point.position);
                    }
                }
                candidateLayers['points'][candidate] = layer;
                candidateLayers['points'][allLabel].addLayer(layer);
                candidateLayers['clusters'][candidate] = clusterLayer;
                candidateLayers['clusters'][allLabel].addLayer(clusterLayer);
                candidateLayers['heat map'][candidate] = L.heatLayer(pointsForHeatMap, heatMapOptions);
                candidateIndex++;
            }
            const layersControl = L.control.layers(null, {'Wards': wardLayer}, {collapsed: false})
                .addTo(map);
            map.fitBounds(wardLayer.getBounds());
            $('.leaflet-control-layers').on('click', '#type-radios', function () {
                const type = $('input:radio:checked', this).val();
                adjustLayersControl(type);
            });
            adjustLayersControl('points');

            function adjustLayersControl(wantedType) {
                const overlaysContainer = $('.leaflet-control-layers-overlays');
                let checkedCandidateIndex = $('input:radio', overlaysContainer)
                    .get()
                    .map(input => $(input).prop('checked'))
                    .indexOf(true);
                if (checkedCandidateIndex === -1) {
                    checkedCandidateIndex = 0;
                }
                for (const [type, layerMap] of Object.entries(candidateLayers)) {
                    for (const layer of Object.values(layerMap)) {
                        layersControl.removeLayer(layer);
                        map.removeLayer(layer);
                    }
                    if (type === wantedType) {
                        for (const [name, layer] of Object.entries(layerMap)) {
                            layersControl.addOverlay(layer, name);
                        }
                    }
                }
                let baseRadioLabel;
                $('label', overlaysContainer).each(function (i, label) {
                    if (i < 1) {
                        return;
                    }
                    if (!baseRadioLabel) {
                        baseRadioLabel = $(label);
                    }
                    const color = colors[i - 2] || '';
                    $(label).css('color', color)
                        .find('input')
                        .attr({type: 'radio', name: 'candidate'});
                });
                if ($('#type-radios').length === 0) {
                    const radioDiv = $('<div/>').attr({id: 'type-radios'}).append(
                        Object.keys(candidateLayers).map(function (key) {
                            return baseRadioLabel.clone()
                                .find('span').text(`Display as ${key}`).end()
                                .find('input').attr({name: 'type', value: key}).end()
                        })
                    );
                    overlaysContainer.after(
                        $('<div/>').addClass('leaflet-control-layers-separator'),
                        radioDiv,
                    );
                    $(`#type-radios input:radio[value=${wantedType}]`).prop('checked', true);
                }
                $('input:radio', overlaysContainer).eq(checkedCandidateIndex)
                    .trigger('click');
            }
        });
});
