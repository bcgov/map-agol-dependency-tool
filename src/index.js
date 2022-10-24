const axios = require('axios');
const YAML = require('yaml');
const fs = require('fs');
const csvWriter = require('csv-writer');
const prompts = require("prompts")
const { URLSearchParams } = require('url');

const BASE_URL = "https://governmentofbc.maps.arcgis.com";
const TOKEN_URL = `${BASE_URL}/sharing/rest/generateToken`;
const SEARCH_ENDPOINT = `${BASE_URL}/sharing/rest/search`;
const MAX_EXPECTED_PAGES_OF_WEBMAPS = 1000;
const TOKEN_EXPIRATION_MINUTES = 360;

let token = undefined;
let timestamp = undefined;
let username = "";
let password = "";

async function getAllSearchResults() {
    let results = [];
    let page = 1;

    do {
        if (page > MAX_EXPECTED_PAGES_OF_WEBMAPS) {
            throw new Error("Too many pages! Something probably went wrong.");
        }

        var result = await getPageOfSearchResults(page, true);

        if (!result.results) {
            console.warn(result);
        }
        results = [...results, ...result.results]
        page++;

    } while (~result.nextStart);

    return results;
}

async function getPageOfSearchResults(page, retry) {
    let params = new URLSearchParams('num=100&start=1&sortField=&sortOrder=desc&q=%20orgid%3Aubm4tcTYICKBpist%20(type%3A("Web%20Map"%20OR%20"CityEngine%20Web%20Scene")%20-type%3A"Web%20Mapping%20Application")%20%20-type%3A"Code%20Attachment"%20-type%3A"Featured%20Items"%20-type%3A"Symbol%20Set"%20-type%3A"Color%20Set"%20-type%3A"Windows%20Viewer%20Add%20In"%20-type%3A"Windows%20Viewer%20Configuration"%20-type%3A"Map%20Area"%20-typekeywords%3A"MapAreaPackage"%20-type%3A"Indoors%20Map%20Configuration"%20-typekeywords%3A"SMX"&f=json');
    params.set("start", page * 100 - 99);
    let requestUrl = `${SEARCH_ENDPOINT}?${params}`

    if (token) {
        requestUrl += `&token=${token}`;
    }

    let response = await axios.get(requestUrl);

    if (response && response.data && response.data.error && response.data.error.code === 498) {
        if (retry) {
            console.log("Token expired, attempting to refresh.");
            await getToken();
            return getPageOfSearchResults(page, false);
        }
        throw Error("Unable to get page of results after refreshing token");
    }

    return response.data; // for simplicity's sake, we just assume every request goes through
}

async function getMapLayers(mapId, retry) {
    let endpoint = `https://governmentofbc.maps.arcgis.com/sharing/rest/content/items/${encodeURIComponent(mapId)}/data?f=json`;

    if (token) {
        endpoint += `&token=${token}`;
    }

    let response = await axios.get(endpoint);

    if (response && response.data && response.data.error && response.data.error.code === 498) {
        if (retry) {
            console.log("Token expired, attempting to refresh.");
            await getToken();
            return await getMapLayers(mapId, false);
        }
        throw Error("Unable to get layers from map after refreshing token");
    }

    if (response.data.operationalLayers) {
        return response.data.operationalLayers.map(layer => ({
            id: layer.id,
            itemId: layer.itemId,
            title: layer.title
        }));
    } else {
        return [];
    }
};

async function getDetailedLayer(layerItemId, retry) {
    const response = await getDetailedLayerResponse(layerItemId);

    if (response && response.error) {
        console.log(`Error fetching layer with itemId: ${layerItemId}`);
        return null;
    }

    return response;
}

async function getDetailedLayerResponse(layerItemId) {
    let endpoint = `https://governmentofbc.maps.arcgis.com/sharing/rest/content/items/${encodeURIComponent(layerItemId)}?f=json`;

    if (token) {
        endpoint += `&token=${token}`;
    }
  
    const response = (await axios.get(endpoint)).data;

    return response;
}

function getRelevantMaps(maps, detailedLayer) {
    const filteredMaps = maps.filter(map => map.layers.some(layer => layer.itemId === detailedLayer.id));

    return filteredMaps.map(m => ({
        id: m.id,
        title: m.title,
        numViews: m.numViews,
        owner: m.owner
    }));
}

async function getToken() {
    const form = new URLSearchParams(
        {
            username,
            password,
            expiration: TOKEN_EXPIRATION_MINUTES,
            referer: BASE_URL,
            f: "json"
        }
    );
    
    const response = await axios({
        method: "post",
        url: TOKEN_URL, 
        data: form.toString(),
        config: {
            headers: {
                "Content-Type": "multipart/form-data"
        }}
    });

    if (response.data.error) {
        console.error(response.data.error);
        throw Error("An error occurred. Unable to retrieve token. Note that usernames and password are case sensitive.");
    }

    if (response.data && response.data.token) {
        return response.data.token;
    }
    
    return undefined;
}

async function isValidItemId(layerItemId) {
    const response = await getDetailedLayerResponse(layerItemId);

    if (response && response.error) {
        return false;
    }

    return true;
}

async function main() {
    const questions = [
        {
            type: "text",
            name: "username",
            message: "AGOL username (optional):"
        },
        {
            type: prev => prev ? "password" : null,
            name: "password",
            message: "AGOL password:",
            validate: value => value !== undefined && value !== ""

        },
        {
            type: "text",
            name: "itemIds",
            message: "Enter AGOL item IDs of layers of interest, or leave blank to report on all layers and maps."
        }
    ];
    
    const response = await prompts(questions)

    if (response.username) {
        username = response.username;
        password = response.password;
        token = await getToken();
    }

    if (!token) {
        console.log("Proceeding without a token. Only publicly available webmaps will be processed.");
    }

    const uniqueLayerItemIds= new Set;

    // Check if the user entered itemIds and validate that they exist in BC Map Hub. If not, exit with an error.
    if (response.itemIds) {
        const items = response.itemIds.split(',');
        for (const itemId of items) {
            const trimmedItemId = itemId.trim()
            if (await isValidItemId(trimmedItemId)) {
                uniqueLayerItemIds.add(trimmedItemId);
            } else {
                console.warn(`Warning: Could not locate item with ID ${trimmedItemId} in ArcGIS Online. Please confirm that the item exists and that you have permission to access it.`);
            }
        }

        if (!uniqueLayerItemIds.size) {
            throw Error("Error: Could not find any of the itemIds you entered. Please see earlier output for specific itemIds. Exiting program.");
        }
    }


    let allResults = (await getAllSearchResults()).map(result => ({
        id: result.id,
        title: result.title,
        numViews: result.numViews,
        owner: result.owner
    }));

    let n = 1;

    for (const map of allResults) {
        console.warn(`${n++}/${allResults.length} Getting layer information for webmap: ${map.title}`);
        map.layers = await getMapLayers(map.id, true);
    }

    timestamp = Date.now();

    fs.writeFileSync(`reports/maps_${timestamp}.yml`, YAML.stringify(allResults));

    // If uniqueLayerItemIds is empty, no itemIds were specififed on the command line,
    // so we populate it here with layer itemIds from the webmap data.
    if (!uniqueLayerItemIds.size) {
        for (const map of allResults) {
            for (const layer of map.layers) {
                if (layer.itemId) {
                    uniqueLayerItemIds.add(layer.itemId);
                }
            }
        }
    }

    const detailedLayerPromises = [...uniqueLayerItemIds].map(layerItemId => getDetailedLayer(layerItemId, true));
    const detailedLayers = (await Promise.all(detailedLayerPromises)).filter(rv => rv !== null);

    // transform object so it's layers are top level instead of maps
    const layersAsTopLevel = detailedLayers.map(detailedLayer => {
        const { id, url, title} = detailedLayer;
        return {
            id,
            title,
            url,
            maps: getRelevantMaps(allResults, detailedLayer)
        }
    });

    createCsvFile(layersAsTopLevel);

    fs.writeFileSync(`reports/layers_${timestamp}.yml`, YAML.stringify(layersAsTopLevel));
}

function createCsvFile(layersAsTopLevel) {
    const csvHeader = ["layer_id", "layer_title", "layer_url", "map_item_id", "map_name", "map_views", "map_owner"];
    const writer = csvWriter.createArrayCsvWriter({
        header: csvHeader,
        path: `reports/dependencies_${timestamp}.csv`
    });
    const dependencies = [];

    for (const layer of layersAsTopLevel) {
        if (layer && layer.maps) {
            const layerRecord = [layer.id, layer.title, layer.url];
            for (const map of layer.maps) {
                const mapRecord = [map.id, map.title, map.numViews, map.owner];
                const record = [...layerRecord, ...mapRecord];
                dependencies.push(record);
            }
        }
    }

    writer.writeRecords(dependencies);
}

// ----------
// Run script
// ----------

main();
