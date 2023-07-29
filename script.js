// Constants
const MARGIN = { top: 20, right: 20, bottom: 50, left: 70 };
const WIDTH = 960 - MARGIN.left - MARGIN.right;
const HEIGHT = 500 - MARGIN.top - MARGIN.bottom;
const TARGET_DATE = "3/3/20"; // Example date. Adjust as needed.
console.log(TARGET_DATE);

const [INDEX_MIN, INDEX_MAX, TOOLTIP, LINE_CHART_CONTAINER, WORLD_MAP_CONTAINER] = [
    0, 
    1, 
    d3.select("#tooltip"),
    d3.select('#line-chart-container'), 
    d3.select('#world-map-container')
];

const [LINE_CHART_TITLE, WORLD_MAP_TITLE] = [
    d3.select("body").insert("h2", ":first-child").text("Line Chart: COVID-19 Accumulated Confirmed Cases"),
    d3.select("body").insert("h2", ":first-child").text("World Map: COVID-19 Confirmed Cases").style('display', 'none')
];

const COUNTRY_NAME_MAP = {
    "UNITED STATES OF AMERICA": "US",
    "Myanmar": "Burma",
    "North Korea": "Korea North",
    "South Korea": "Korea South"
    // Add more mappings as needed
};

let index = INDEX_MIN;
let svg2, mapDataPromise;

const colorScale = d3.scaleSequential().interpolator(d3.interpolateOrRd);

const displayScene = (idx) => {
    const [chartDisplay, mapDisplay] = idx === INDEX_MIN ? ['block', 'none'] : ['none', 'block'];

    LINE_CHART_TITLE.style('display', chartDisplay);
    WORLD_MAP_TITLE.style('display', mapDisplay);
    LINE_CHART_CONTAINER.style('display', chartDisplay);
    WORLD_MAP_CONTAINER.style('display', mapDisplay);

    if (idx !== INDEX_MIN) {
        svg2.transition().duration(1000).style("opacity", 1);
    } else {
        svg2.style("opacity", 0);
    }
};

// Navigation
d3.select('#previous').on('click', () => {
    index = Math.max(INDEX_MIN, --index);
    displayScene(index);
});
d3.select('#next').on('click', () => {
    index = Math.min(INDEX_MAX, ++index);
    displayScene(index);
});

// 1. Separate Data Parsing
function parseLineChartData(data) {
    const parsedData = data.flatMap(d => Object.entries(d)
        .filter(([key]) => !["Province/State", "Country/Region", "Lat", "Long"].includes(key))
        .map(([key, value]) => ({
            date: d3.timeParse("%m/%d/%y")(key),
            cases: +value
        }))
    );

    const dataByCountry = data.reduce((acc, d) => {
        if (!acc[d["Country/Region"]]) {
            acc[d["Country/Region"]] = [];
        }
        acc[d["Country/Region"]].push(d);
        return acc;
    }, {});

    return { parsedData, dataByCountry };
}

// 2. Render Line Chart
function renderLineChart({ parsedData, dataByCountry }) {
    const svg = d3.select("#line-chart-container").append("svg")
        .attr("width", WIDTH + MARGIN.left + MARGIN.right)
        .attr("height", HEIGHT + MARGIN.top + MARGIN.bottom)
        .append("g")
        .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    // Add X axis
    var x = d3.scaleTime()
        .domain(d3.extent(parsedData, function(d) { return d.date; }))
        .range([0, WIDTH]);
    svg.append("g")
        .attr("transform", "translate(0," + HEIGHT + ")")
        .call(d3.axisBottom(x));

    // Add Y axis
    var y = d3.scaleLinear()
        .domain([0, d3.max(parsedData, function(d) { return +d.cases; })])
        .range([HEIGHT, 0]);
    svg.append("g").call(d3.axisLeft(y));

    const allCountries = Object.keys(dataByCountry);
    //console.log(allCountries);
    const colors = d3.scaleOrdinal(d3.schemeCategory10).domain(Object.keys(dataByCountry));

Object.keys(dataByCountry).forEach(country => {
    // Filter out unwanted keys
    const filterKeys = (entry) => {
        const [key] = entry;
        const unwantedKeys = ["Province/State", "Country/Region", "Lat", "Long"];
        return !unwantedKeys.includes(key);
    };
    // Convert entry to desired format
    const mapEntryToData = (entry) => {
        const [key, value] = entry;
        return {
            date: d3.timeParse("%m/%d/%y")(key),
            cases: +value
        };
    };
    // Main processing function
    const processCountryData = (countryData) => {
        return Object.entries(countryData)
            .filter(filterKeys)
            .map(mapEntryToData);
    };

    const countryData = dataByCountry[country].flatMap(processCountryData);
    const totalCasesByDate = d3.rollups(countryData, v => d3.sum(v, d => d.cases), d => d.date);

    svg.append("path")
    .datum(totalCasesByDate)
    .attr("fill", "none")
    .attr("stroke", colors(country))
    .attr("stroke-width", 1.5)
    .attr("class", "visible-line")  // Add a class for the visible line
    .attr("data-country", country)  // Add a data attribute for the country name
    .attr("d", d3.line()
        .x(d => x(d[0]))
        .y(d => y(d[1]))
    )

    svg.append("path")
    .datum(totalCasesByDate)
    .attr("fill", "none")
    .attr("stroke", "transparent")
    .attr("stroke-width", 20)  // Adjust this width to determine how close the mouse has to be to the line to trigger the tooltip.
    .attr("class", "invisible-line")  // Add a class for the invisible line
    .attr("data-country", country)  // Add a data attribute for the country name
    .attr("d", d3.line()
        .x(d => x(d[0]))
        .y(d => y(d[1]))
    )
    .on("mouseover", handleLineMouseOver)
    .on("mousemove", (event, d) => handleLineMouseMove(event, d, country))
    .on("mouseout", handleLineMouseOut);

    function handleLineMouseMove(event, d, country) {
        const [xPos] = d3.pointer(event, this); 
        const xDomain = x.invert(xPos);
        const bisect = d3.bisector(d => d.date).left;
        const index = bisect(parsedData, xDomain, 1);
        const a = parsedData[index - 2];
        const b = parsedData[index - 1];
        const point = xDomain - a.date > b.date - xDomain ? b : a;
    
        const formattedDate = d3.timeFormat("%Y-%m-%d")(point.date);
        const content = `<strong>Country: </strong>${country}<br>
                        <strong>Date: </strong>${formattedDate}<br>
                        <strong>Daily Confirmed Cases: </strong>${point.cases}`;
        showTooltip(event, content);
    }
    
    function handleLineMouseOver(d, i) {
        const country = d3.select(this).attr("data-country");
        const visibleLine = d3.select(`.visible-line[data-country="${country}"]`);
    
        visibleLine.style("cursor", "pointer");
        visibleLine.style("stroke-width", 3);
    }
    
    function handleLineMouseOut(d, i) {
        hideTooltip();
        
        const country = d3.select(this).attr("data-country");
        const visibleLine = d3.select(`.visible-line[data-country="${country}"]`);
        
        visibleLine.style("stroke-width", 1);
    }

});
}

d3.csv("confirmed.csv").then(data => {
    const { parsedData, dataByCountry } = parseLineChartData(data);
    renderLineChart({ parsedData, dataByCountry });
    renderWorldMap(data, TARGET_DATE);
});

function showTooltip(event, content) {
    d3.select("#tooltip")
        .style("left", event.pageX + 15 + "px")
        .style("top", event.pageY + "px")
        .html(content);
    d3.select("#tooltip").style("display", "block");
}

function hideTooltip() {
    d3.select("#tooltip").style("display", "none");
}

function renderWorldMap(data, targetDate) {
    console.log(targetDate)
    d3.select("#world-map-container").select("svg").remove(); // Remove any existing svg
    svg2 = d3.select("#world-map-container")
         .append("svg")
        .attr("width", WIDTH + MARGIN.left + MARGIN.right)
        .attr("height", HEIGHT + MARGIN.top + MARGIN.bottom)
        .style("opacity", 0);  // Ensures initial opacity is 0 for the world map

    var projection = d3.geoMercator()
        .scale(WIDTH / 2 / Math.PI)
        .translate([WIDTH / 2, HEIGHT / 1.5]);

    var path = d3.geoPath().projection(projection);
    var casesByCountry = Array.from(d3.rollup(data, v => d3.sum(v, d => d[targetDate]), d => d['Country/Region']));
    //var casesByCountry = Array.from(d3.rollup(data, v => d3.sum(v, d => d[TARGET_DATE]), d => d['Country/Region']));

    var casesByCountry = Array.from(d3.rollup(data, v => d3.sum(v, d => d[targetDate]), d => d['Country/Region']));
    var maxVal = d3.max(casesByCountry, function(d) { return d[1]; });
    colorScale.domain([0, maxVal]);
    
    // Convert casesByCountry to a map for faster lookups and transform keys to uppercase
    var casesByCountryMap = new Map(casesByCountry.map(d => [d[0].toUpperCase(), d[1]]));    

    svg2.selectAll("path").remove();

    mapDataPromise = d3.json(`https://unpkg.com/world-atlas@2/countries-110m.json?nocache=${new Date().getTime()}`);
    mapDataPromise.then(function(data) {
        svg2.selectAll("path")
        .data(topojson.feature(data, data.objects.countries).features)
        .enter()
        .append("path")
        .style("fill", colorFn)
        .attr("d", path)
        .style("stroke", "#999")
        .style("stroke-width", "1.5")
        .on("mouseover", handleMouseOver) // Add mouseover event handler
        .on("mouseout", handleMouseOut); // Add mouseout event handler

        const MIN_VALUE = 0;
        const MAX_VALUE = 40000;  // You can adjust this later based on your data
        colorScale.domain([MIN_VALUE, MAX_VALUE]);
        
        // In the colorFn:
        function colorFn(d) {
            let cases;
            let countryName = d.properties.name.toUpperCase();
            if (COUNTRY_NAME_MAP[countryName]) {
                cases = casesByCountryMap.get(COUNTRY_NAME_MAP[countryName]);
            } else {
                cases = casesByCountryMap.get(countryName);
            }
            
            if (cases === undefined) {
                console.log(d.properties.name); // Log only if cases are undefined
            }
            var color = cases == null ? "#ccc" : colorScale(cases);
            return color;
        }

        // Create a color legend below the world map
        const legendMargin = { top: 10, right: 20, bottom: 30, left: 20 };
        const legendWidth = 300;
        const legendHeight = 30;
        const map_width = 300;
        const gradient = svg2.append("defs")
        .append("linearGradient")
        .attr("id", "gradient")
        .attr("x1", "0%")
        .attr("x2", "100%")
        .attr("y1", "0%")
        .attr("y2", "0%");

        gradient.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", colorScale(0))
        .attr("stop-opacity", 1);

        gradient.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", colorScale(MAX_VALUE))
        .attr("stop-opacity", 1);

        const legend = svg2.append("g")
        .attr("transform", `translate(${legendMargin.left},${HEIGHT + legendMargin.top})`);

        legend.append("rect")
        .attr("x", map_width)
        .attr("y", 30)
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#gradient)");

        legend.append("text")
        .attr("x", map_width)
        .attr("y", 25)
        .text("0 Cases");

        legend.append("text")
        .attr("x", map_width+legendWidth)
        .attr("y", 25)
        .attr("text-anchor", "end")
        .text(`${MAX_VALUE} Cases~`);
        });

        // Extract the case determination for a given country feature.
        function getCasesForCountryFeature(d) {
            if (!d.properties) return null;
            
            var countryName = d.properties.name;
            return casesByCountryMap.get(countryName.toUpperCase());
        }

        function handleMouseOver(event, d) {
            const cases = getCasesForCountryFeature(d);
            if (cases) {
                d3.select(event.currentTarget).style("stroke-width", 3);
                const content = `<strong>Country: </strong>${d.properties.name}<br>
                                <strong>Confirmed Cases: </strong>${cases}`;
                showTooltip(event, content);
            }
        }
        
        function handleMouseOut(event, d) {
            d3.select(event.currentTarget).style("stroke-width", 1);
            hideTooltip();
        }

        function updateStyle(element, styleProperty, value) {
            d3.select(element).style(styleProperty, value);
        }

        function updateTooltipForMap(pageX, pageY, country, cases) {
            d3.select("#tooltip")
                .style("left", pageX + 15 + "px")
                .style("top", pageY + "px")
                .html("<strong>Country: </strong>" + country + "<br>" +
                    "<strong>Confirmed Cases: </strong>" + cases);
            d3.select("#tooltip").style("display", "block");
        }

        d3.select("#dateSelector").on("change", function() {
            const newDate = d3.select(this).property("value");
            renderWorldMap(data, newDate);
            svg2.transition().duration(1000).style("opacity", 1);
        });
    }