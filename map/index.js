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
            const map = L.map('map');
            L.tileLayer('https://{s}.tiles.mapbox.com/v3/kcivey.i8d7ca3k/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ' +
                    '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
                    '<strong><a href="https://www.mapbox.com/map-feedback/" target="_blank">' +
                    'Improve this map</a></strong>',
                opacity: 0.5,
            }).addTo(map);
            map.addLayer(wardLayer);
            const allLabel = 'All Candidates';
            const candidateLayers = {};
            candidateLayers[allLabel] = L.layerGroup();
            const candidateClusterLayers = {};
            candidateClusterLayers[allLabel] = L.markerClusterGroup();
            const colors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3'];
            const baseRadius = 2.5;
            let i = 0;
            for (const [candidate, points] of Object.entries(contributors)) {
                const layer = L.layerGroup();
                const clusterLayer = L.markerClusterGroup();
                for (const point of points) {
                    L.circleMarker(
                        point.position,
                        {
                            weight: 2,
                            color: colors[i],
                            radius: baseRadius * (point.contributors ** 0.5),
                        }
                    ).addTo(layer);
                    for (let i = 0; i < point.contributors; i++) {
                        L.circleMarker(
                            point.position,
                            {
                                weight: 2,
                                color: colors[i],
                                radius: baseRadius,
                            }
                        ).addTo(clusterLayer);
                    }
                }
                candidateLayers[candidate] = layer;
                candidateLayers[allLabel].addLayer(layer);
                candidateClusterLayers[candidate] = clusterLayer;
                candidateClusterLayers[allLabel].addLayer(clusterLayer);
                i++;
            }
            const layersControl = L.control.layers(null, {'Wards': wardLayer}, {collapsed: false})
                .addTo(map);
            map.fitBounds([[38.792, -77.120], [38.995, -76.909]]);
            $('.leaflet-control-layers').on('click', '#use-clusters', function () {
                adjustLayersControl($(this).prop('checked'));
            });
            adjustLayersControl();

            function adjustLayersControl(useClusters = false) {
                const overlaysContainer = $('.leaflet-control-layers-overlays');
                const checkedRadioIndex = $('input:radio', overlaysContainer)
                    .get()
                    .map(input => $(input).prop('checked'))
                    .indexOf(true);
                let baseCheckboxLabel;
                const [removeLayers, addLayers] = useClusters ?
                    [candidateLayers, candidateClusterLayers] :
                    [candidateClusterLayers, candidateLayers];
                for (const layer of Object.values(removeLayers)) {
                    layersControl.removeLayer(layer);
                    map.removeLayer(layer);
                }
                for (const [name, layer] of Object.entries(addLayers)) {
                    layersControl.addOverlay(layer, name);
                }
                $('label', overlaysContainer).each(function (i, label) {
                    if (i < 1) {
                        baseCheckboxLabel = $(label);
                        return;
                    }
                    const color = colors[i - 2] || '';
                    $(label).css('color', color)
                        .find('input')
                        .attr({type: 'radio', name: 'candidate'});
                });
                if ($('#use-clusters').length === 0) {
                    overlaysContainer.after(
                        $('<div/>').addClass('leaflet-control-layers-separator'),
                        $('<div/>').append(
                            baseCheckboxLabel.clone()
                                .find('span').text('Display as clusters').end()
                                .find('input').attr({id: 'use-clusters'}).end()
                        )
                    );
                }
                $('#use-clusters').prop('checked', useClusters);
                if (checkedRadioIndex > -1) {
                    $('input:radio', overlaysContainer).eq(checkedRadioIndex)
                        .trigger('click');
                }
            }
        });
});
