export default class EventHandler {
    constructor() {
        this.settingsLoaded = new Event('settingsLoaded');
        this.commentsLoaded = new Event('commentsLoaded');
        this.locationChange = new Event('locationChange');
        this.beforeLocationChange = new Event('beforeLocationChange');
        this.userSync = new Event('userSync');
        this.streamLoaded = new Event('streamLoaded');
        this.locationPattern = new RegExp('\\d+$');

        this.addEvents();
    }


    addEvents() {
        let _this = this;

        (function (loaded) {
          p.View.Stream.Main.prototype.loaded = function (items, position, error) {
            loaded.call(this, items, position, error);
            _this.streamLoaded.data = {
              items,
              position,
              error
            };
            window.dispatchEvent(_this.streamLoaded);
          };
        }(p.View.Stream.Main.prototype.loaded));

        // Because we patched the main stream, we might need to re-init it to bind the new loaded Function
        // Honestley, I don't know how to check whether the p.View.Stream.Main view is active properly.
        // The following part does the trick anyway
        if(p.currentView.stream && p.currentView.loadedBound) {
          p.currentView.init(p.currentView.$container, p.currentView.parent);
        }

        // Add settings-event
        (function (render) {
            p.View.Settings.prototype.render = function (params) {
                render.call(this, params);
                window.dispatchEvent(_this.settingsLoaded);
            };
        }(p.View.Settings.prototype.render));

        // Add locationchange event
        (function (navigate) {
            p.navigateTo = function (location, mode) {
                _this.beforeLocationChange.mode = mode;
                window.dispatchEvent(_this.beforeLocationChange);

                // Call original
                navigate.call(this, location, mode);

                _this.locationChange.mode = mode;
                _this.locationChange.isPost = _this.locationPattern.test(location);
                window.dispatchEvent(_this.locationChange);
            };
        }(p.navigateTo));

        // Add locationchange event
        window.onpopstate = function (e) {
            _this.locationChange.mode = 0;
            _this.locationChange.isPost = _this.locationPattern.test(e.currentTarget.location.pathname);

            window.dispatchEvent(_this.locationChange);
        };

        // Add commentsloaded-event
        (function (render) {
            p.View.Stream.Comments.prototype.render = function () {
                render.call(this);
                _this.commentsLoaded.data = this.$container;
                window.dispatchEvent(_this.commentsLoaded);

            };
        }(p.View.Stream.Comments.prototype.render));

        (function (syncCallback) {
            p.User.prototype.syncCallback = function (response) {
                _this.userSync.data = response;
                syncCallback.call(this, response);
                window.dispatchEvent(_this.userSync);
            };
        }(p.User.prototype.syncCallback));
    }
}