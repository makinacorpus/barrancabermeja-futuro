window.SETTINGS = L.Util.extend({
    attributions: '<a href="http://www.makina-corpus.com">Makina Corpus</a> - Barrancabermeja Ciudad Futuro',
    tileURL: './tiles/{z}/{x}/{y}.png',
    touchTileURL: './tiles/{z}/{x}/{y}.png',
    barrancabermejaStyle: {fillOpacity: 0.2, fillColor: '#77309a', color: '#fff'},
    initialCenter: [[7.063,-73.86], 15],
    clusterOptions: {showCoverageOnHover: false, disableClusteringAtZoom: 14, maxClusterRadius: 40},
    mapOptions: {maxZoom: 17, minZoom: 14, maxBounds: undefined},
    isTouchTable: !(/controls/.test(window.location.hash)),
    autoCloseTimeout: 30000
}, window.SETTINGS || {});


/*
 * Mustache templating, with compiled cache
 */
L.Util.mustache = function (id, context) {
    this.__templates = this.__templates || {};
    var tpl = this.__templates[id];
    if (tpl === undefined) {
        tpl = Handlebars.compile(document.getElementById(id).text);
        this.__templates[id] = tpl;
    }
    return tpl(context);
};

/*
 * Detect overlapping of HTML elements
 */
L.DomUtil.overlaps = function (div1, div2) {
    var rect1 = div1.getBoundingClientRect(),
        rect2 = div2.getBoundingClientRect();
    return !(rect1.right < rect2.left || rect1.left > rect2.right ||
             rect1.bottom < rect2.top || rect1.top > rect2.bottom);
};


( function () {

    window.CG41 = {};

    var ProjectIcon = L.DivIcon.extend({
        /**
            Map marker icon, whose content is controlled in CSS.
            @param name     category (classname)
            @param simple   whether it's a 3D icon or not
        */
        initialize: function (name, kwargs) {
            var options = {
                className: 'project-icon ' + name + (kwargs.simple? ' simple': ' icon3d') + (kwargs.popup? ' has-popup': '')
            };
            if (kwargs.simple) {
                options.labelAnchor = [10, 0];
            }
            L.DivIcon.prototype.initialize.call(this, options);
        }
    });
    CG41.projectIcon = function (name, kwargs) { return new ProjectIcon(name, kwargs); };


    var ProjectMarker = L.Marker.extend({
        /**
            Map marker with label or popup
            @param latlng{L.LatLng}   position
            @param properties{Object} project attributes
        */
        initialize: function (latlng, properties) {
            // If no description or no image, use simple marker
            this.has_description = !(/^(\s)*$/.test(properties.description));
            this.simple = properties.simple === true || (!this.has_description || /^(\s)*$/.test(properties.image));
            this.only_description = this.has_description && !(properties.image || properties.budget || properties.date);

            var options = {
                icon: CG41.projectIcon(properties.category, {simple: this.simple, popup: this.has_description}),
                clickable: this.has_description
            };
            L.Marker.prototype.initialize.call(this, latlng, options);

            this.properties = properties;

            if (this.simple && !this.has_description) {
                this.bindLabel(properties.nom, {
                    noHide: true,
                    className: properties.category
                });
            }
        },

        /**
            Show label automatically
         */
        onAdd: function (map) {
            L.Marker.prototype.onAdd.call(this, map);
            if (this.simple) {
                this.showLabel();
            }

            // Open popup if project has description
            if (this.has_description) {
                this.on('click', function () {
                    this._openPopup(map);
                }, this);
            }

            // Close if other overlaps
            map.on('popupopen', function (e) {
                if (!this.popup || this.popup == e.popup)
                    return;
                if (L.DomUtil.overlaps(this.popup._container,
                                       e.popup._container)) {
                    this.popup._close();
                }
            }, this);

            // Clear reference on close
            map.on('popupclose', function (e) {
                if (this.popup == e.popup) {
                    if (this._icon) L.DomUtil.removeClass(this._icon, 'popup-open');
                    this.popup = null;
                }
            }, this);
        },

        _openPopup: function (map) {
            // Do not open popup twice
            if (this.popup) return;

            // Build popup
            var popup = L.popup({ offset: L.point(4, -15), maxWidth: "auto", autoPan: false })
                         .setLatLng(this.getLatLng())
                         .setContent(L.Util.mustache('project-template-popup', this.properties));

            map.addLayer(popup);
            this.popup = popup;
            L.DomUtil.addClass(popup._container, this.simple ? 'simple' : 'icon3d');
            L.DomUtil.addClass(popup._container, this.only_description ? 'only-description' : '');
            L.DomUtil.addClass(popup._container, this.properties.category);
            L.DomUtil.addClass(this._icon, 'popup-open');

            map.fire('popupopen', {popup: popup});

            L.DomUtil.addClass(popup._container, 'open');

            // Auto-close popups after some time
            if (SETTINGS.autoCloseTimeout > 0 && SETTINGS.isTouchTable) {
                setTimeout(function (e) {
                    popup._close();
                }, SETTINGS.autoCloseTimeout);
            }
        }
    });
    CG41.projectMarker = function (latlng, properties) { return new ProjectMarker(latlng, properties); };


    var ProjectLayer = L.MarkerClusterGroup.extend({
        /**
            Map clustered layer with project markers
        */
        initialize: function (options) {
            options = L.Util.extend(SETTINGS.clusterOptions, options);
            L.MarkerClusterGroup.prototype.initialize.call(this, options);
        },

        /**
            Load projects from JSON
         */
        load: function () {
            this.records = projectsData.data;
            this._loaded();
        },

        /**
            Add loaded records to layer 
         */
        _loaded: function () {
            // Build temporary list
            var layers = [];
            for (var i=0, n=this.records.length; i<n; i++) {
                var record = this.records[i],
                    pos = JSON.parse(record['geom']);
                // Daybed positions are x,y (lng/lat) : reverse for Leaflet
                pos = pos.reverse();
                delete record['geom'];
                layers.push(CG41.projectMarker(pos, record));
            }
            // Add in bulk to cluster
            this.addLayers(layers);
        }
    });
    CG41.projectLayer = function (url) { return new ProjectLayer(url); };


    /**
        Initialize map in specified div
        @param divid DOM element name
     */
    CG41.initializeMap = function (divid) {
        var osm = L.tileLayer(SETTINGS.isTouchTable ? SETTINGS.touchTileURL : SETTINGS.tileURL, {tms: true});
        var borders = L.geoJson(bordersBarranca, {style: SETTINGS.barrancabermejaStyle});

        var projects = CG41.projectLayer();

        SETTINGS.mapOptions.maxBounds = borders.getBounds().pad(0.6);

        var map = L.map(divid, SETTINGS.mapOptions)
            .addLayer(borders)
            .addLayer(osm)
            .addLayer(projects);
        map.attributionControl.setPrefix(SETTINGS.attributions);

        // var resetView = new L.Control.ResetView(borders.getBounds());
        // map.addControl(resetView);

        /*
         * Bypass original resetview method to obtain destination zoom.
         * Otherwise, 'zoomstart' event does not provide it.
         */
        map._resetView = function (center, zoom, preserveMapOffset, afterZoomAnim) {
            L.Map.prototype._resetView.apply(map, arguments);
            map.fire('prereset', {zoom: zoom});
        };

        map.on('prereset', function (e) {
            var z = e.zoom;
            for (var i=0; i<20; i++) {
                if (i== z)
                   L.DomUtil.addClass(this._container, 'zoom-'+i);
                else
                   L.DomUtil.removeClass(this._container, 'zoom-'+i);
            }
        });

        /*
         * Change maxBounds of the map proportionnaly to the current zoom level
         */
        map.on('zoomend', function() {
            var maxBoundsAtZoom = Math.max(0.02, 0.6 - (0.2 * (map.getZoom() - 10)));
            map.setMaxBounds(borders.getBounds().pad(maxBoundsAtZoom));
        });

        /*
         * Dezooming on touch devices causes map to disapear from the viewport. If it happens, center the map :
         */
        map.on('moveend', function() {
            if(!SETTINGS.mapOptions.maxBounds.pad(0.2).contains(map.getBounds())){
                map.fitBounds(SETTINGS.mapOptions.maxBounds);
            }
        });

        projects.load();

        map.setView.apply(map, SETTINGS.initialCenter);

        $(window).trigger('map:ready', map);

        /**
            If the map is shown in public (touch table)
         */
        if (SETTINGS.isTouchTable) {
            // Give CSS a hook
            $('#'+divid).addClass('touch-table');

            // Remove zoom control
            map.zoomControl.removeFrom(map);

            // Disable right-click
            $(document).on('contextmenu', function(e) {
                e.preventDefault();
            });
        }
    };
})();
