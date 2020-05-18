/**
 * Copyright 2020 Keith C. Ivey
 * keith@iveys.org
 * https://dcgeekery.com
 * ISC License
 * Source: https://github/kcivey/dc-ocf
 */
/* globals d3 */
/* eslint-disable no-restricted-properties */
(function () {
    const svg = d3.select('svg');
    const {height, width} = svg.node().getBoundingClientRect();
    const simulation = d3.forceSimulation()
        .force(
            'link',
            d3.forceLink()
                .id(d => d.id)
                // .distance(d => 200 / d.count)
        )
        .force('charge', d3.forceManyBody().strength(-100))
        .force('center', d3.forceCenter(width / 2, height / 2));

    d3.json('dc-endorsements.json').then(drawGraph);

    function drawGraph(endorsementData) {
        const link = svg.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(endorsementData.links)
            .enter()
            .append('line')
            .attr('stroke', '#333');
            // .attr('stroke-width', d => 2 * Math.sqrt(d.count))
        const node = svg.append('g')
            .attr('class', 'nodes')
            .selectAll('circle')
            .data(endorsementData.nodes)
            .enter()
            .append('circle')
            .attr('r', d => (d.type === 'endorser' ? 5 : 8))
            .attr('fill', d => (d.type === 'endorser' ? '#1f77b4' : '#ff7f0e'))
            .call(
                d3.drag()
                    .on('start', dragstarted)
                    .on('drag', dragged)
                    .on('end', dragended)
            );
        node.append('title')
            .text(d => d.id);
        simulation
            .nodes(endorsementData.nodes)
            .on('tick', ticked);
        simulation.force('link')
            .links(endorsementData.links);

        function ticked() {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            node
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);
        }
    }

    function dragstarted(d) {
        if (!d3.event.active) {
            simulation.alphaTarget(0.3).restart();
        }
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    function dragended(d) {
        if (!d3.event.active) {
            simulation.alphaTarget(0);
        }
        d.fx = null;
        d.fy = null;
    }

})();
