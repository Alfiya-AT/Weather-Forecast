import fetch from 'node-fetch';

const WEATHERSTACK_API_KEY = 'b087f69051908460b94ed65c77a15842';

async function testFetch() {
    const location = 'London';
    const currentUrl = `http://api.weatherstack.com/current?access_key=${WEATHERSTACK_API_KEY}&query=${encodeURIComponent(location)}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(currentUrl)}`;

    console.log(`Fetching: ${proxyUrl}`);

    try {
        const response = await fetch(proxyUrl);
        console.log(`Status: ${response.status}`);

        const rawData = await response.json();
        console.log(`Raw Data structure keys: ${Object.keys(rawData)}`);

        if (rawData.contents) {
            const data = JSON.parse(rawData.contents);
            console.log("Successfully parsed weather data:");
            console.log(`Location: ${data.location ? data.location.name : 'Unknown'}`);
            if (data.current) {
                console.log(`Temp: ${data.current.temperature}°C`);
                console.log(`Desc: ${data.current.weather_descriptions[0]}`);
            } else if (data.error) {
                console.log(`API Error: ${data.error.info}`);
            } else {
                console.log("Unknown data structure returned by API.");
                console.log(JSON.stringify(data, null, 2));
            }
        } else {
            console.log("No 'contents' field in proxy response.");
            console.log(JSON.stringify(rawData, null, 2));
        }
    } catch (err) {
        console.error("Fetch failed with error:");
        console.error(err);
    }
}

testFetch();
