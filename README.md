# ArcGIS Layer Dependencies Tracker

This tool is used to track which webmaps depend on which layers.

This nodejs app can be used to assemble a report containing all the publicly shared webmaps on the [Government of BC Maps ArcGIS page](https://governmentofbc.maps.arcgis.com/home/search.html?t=content&q=&focus=maps-webmaps) along with their layers. If an ArcGIS Online account is provided via command line parameters, all webmaps accessible to that user will be included in the output. When an administrator account is used, all webmaps in the Government of BC organzation will be included in the output. If a comma separted list of item IDs corresponding to feature layers of interest is supplied as a parameter, the report will only include webmaps that contain the specified layers.



## Usage

### Basic Usage - Report includes all publicly shared webmaps
```bash

npm i # install packages
node src/index.js # or npm run start

```

1. You will be prompted for a BC MapHub username. This step is optional, press Enter to continue.
2. Next you are prompted for a list of layer itemIds. This step is optional, press Enter to continue.
3. Once complete, three output files can be found in the 'reports' directory.
 - dependencies.csv - A CSV file listing layers and the webmaps that use them
 - layers.yml - A .yml file containing a hierachical view of layers and the webmaps that use them
 - maps.yaml - A .yml file containing the harvested map data

### Advanced Usage - Report includes all webmaps in BC MapHub and all layers within those webmaps.
1. Start the script as for 'Basic Usage' above.
2. Enter the username of an admin account when prompted and press Enter.
3. Enter the password for the admin account and press Enter.
4. Next you are prompted for a list of layer itemIds. This step is optional, press Enter to continue.

### Advanced Usage - Report includes a specific list of layers of interest
1. Start the script as for 'Basic Usage' above.
2. Optionally enter the username of an admin account when prompted and press Enter.
3. Optionally enter the password for the admin account and press Enter.
4. Next you are prompted for a list of layer itemIds. Enter a comma separated list of layer itemIds and press Enter

## Strategy

### 1. Use Rest API to gather all web maps from the search results

Search results have JSON endpoints at URLs that look like this: [https://governmentofbc.maps.arcgis.com/sharing/rest/search?num=100&<strong>start=1</strong>&sortField=&sortOrder=desc&q=%20orgid%3Aubm4tcTYICKBpist%20(type%3A(%22Web%20Map%22%20OR%20%22CityEngine%20Web%20Scene%22)%20-type%3A%22Web%20Mapping%20Application%22)%20%20-type%3A%22Code%20Attachment%22%20-type%3A%22Featured%20Items%22%20-type%3A%22Symbol%20Set%22%20-type%3A%22Color%20Set%22%20-type%3A%22Windows%20Viewer%20Add%20In%22%20-type%3A%22Windows%20Viewer%20Configuration%22%20-type%3A%22Map%20Area%22%20-typekeywords%3A%22MapAreaPackage%22%20-type%3A%22Indoors%20Map%20Configuration%22%20-typekeywords%3A%22SMX%22&f=json](https://governmentofbc.maps.arcgis.com/sharing/rest/search?num=100&start=1&sortField=&sortOrder=desc&q=%20orgid%3Aubm4tcTYICKBpist%20(type%3A(%22Web%20Map%22%20OR%20%22CityEngine%20Web%20Scene%22)%20-type%3A%22Web%20Mapping%20Application%22)%20%20-type%3A%22Code%20Attachment%22%20-type%3A%22Featured%20Items%22%20-type%3A%22Symbol%20Set%22%20-type%3A%22Color%20Set%22%20-type%3A%22Windows%20Viewer%20Add%20In%22%20-type%3A%22Windows%20Viewer%20Configuration%22%20-type%3A%22Map%20Area%22%20-typekeywords%3A%22MapAreaPackage%22%20-type%3A%22Indoors%20Map%20Configuration%22%20-typekeywords%3A%22SMX%22&f=json)

We can paginate through results using the `start` parameter of the above URL. We're expecting to see the following JSON returned. What we're after is in the results section.

```javascript
{

  "total" : int,
  "start" : int,
  "num" : int,
  "nextStart" : int,

  // [ ... ]

  "results": [

    // [ ... ] 

  ]

}

```

Fields of interest from the items in the results list include:

  - `id`
  - `title`
  - `map_owner`
  - `numViews`

### 2. For each map above, gather the URL/ID, view count, owner and list of attached layers

We can gather some of that information from the search results directly, but for other bits of information (e.g. the list of attached layers) a new request has to be made for each search result. 

### 3. Return all of the above as YAML

We may want to pivot the information in the following ways:

 - Get a flat list of all layers and their associated webmaps

 Note that this is a fork from https://github.com/joe-taylor/arcgis_layer_dependencies and hsa diverged significantly.
