import SERVICES from './services';
import './index.css';
import {debounce} from 'debounce';

/**
 * @typedef {Object} EmbedData
 * @description Embed Tool data
 * @property {string} service - service name
 * @property {string} url - source URL of embedded content
 * @property {string} embed - URL to source embed page
 * @property {number} [width] - embedded content width
 * @property {number} [height] - embedded content height
 * @property {string} [caption] - content caption
 *
 * @typedef {Object} Service
 * @description Service configuration object
 * @property {RegExp} regex - pattern of source URLs
 * @property {string} embedUrl - URL scheme to embedded page. Use '<%= remote_id %>' to define a place to insert resource id
 * @property {string} html - iframe which contains embedded content
 * @property {number} [height] - iframe height
 * @property {number} [width] - iframe width
 * @property {Function} [id] - function to get resource id from RegExp groups
 *
 * @typedef {Object} EmbedConfig
 * @description Embed tool configuration object
 * @property {Object} [services] - additional services provided by user. Each property should contain Service object
 */

/**
 * @class Embed
 * @classdesc Embed Tool for Editor.js 2.0
 *
 * @property {Object} api - Editor.js API
 * @property {EmbedData} _data - private property with Embed data
 * @property {HTMLElement} element - embedded content container
 *
 * @property {Object} services - static property with available services
 * @property {Object} patterns - static property with patterns for paste handling configuration
 */
export default class Embed {

  /**
     * Allow to press Enter inside the LinkTool input
     * @returns {boolean}
     * @public
     */
    static get enableLineBreaks() {
      return true;
    }

  /**
   * Get Tool toolbox settings
   * icon - Tool icon's SVG
   * title - title to show in toolbox
   *
   * @return {{icon: string, title: string}}
   */
  static get toolbox() {
    return {
      icon: `<svg t="1573526873279" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2413" width='20'><path d="M862.02 264.97c-65.37 29.94-110.78 64.79-110.78 64.79V290.8c0-60.28-47.46-109.33-105.76-109.33H173.61c-58.31 0-105.73 49.06-105.73 109.33v464.57c0 60.3 47.42 109.3 105.73 109.3h471.87c58.3 0 105.76-49 105.76-109.3v-30.75s49.91 33.12 115.19 60.59c69.16 30.89 94.29-8.98 94.29-71.02V319.54c-0.8-41.21-21.79-89.48-98.7-54.57z m-6.45 327.95c-0.79 46.6-6.34 60.31-49.95 46.84-50.36-14.98-68.17-35.9-68.17-35.9-8.54-5.07-74.85-5.07-83.38 0-8.54 5.12-8.55 8.6-8.55 18.79v84.47c0 28.84-24.61 52.51-52.51 52.51h-367.6c-27.9 0-52.51-23.67-52.51-52.51V339.54c0-28.85 24.61-52.52 52.51-52.52H593c27.91 0 52.51 23.67 52.51 52.52v86.18c0 10.19 0.01 15.24 8.55 20.34 8.53 5.07 74.84 5.07 83.38 0 0 0 22.95-23.89 73.51-39.89 15.03-4.88 44.61-11.14 44.61 44.93 0.01 42.24 0.01 98.98 0.01 141.82zM310.45 372.05c-29 0-52.51 23.51-52.51 52.51 0 29 23.51 52.51 52.51 52.51 29 0 52.51-23.51 52.51-52.51 0-29-23.52-52.51-52.51-52.51z" p-id="2414"></path></svg>`,
      title: 'Embed'
    };
  }

  /**
   * @param {{data: EmbedData, config: EmbedConfig, api: object}}
   *   data — previously saved data
   *   config - user config for Tool
   *   api - Editor.js API
   */
  constructor({data, config, api}) {
    this.api = api;
    this._data = {};
    this.element = null;

    this.data = data;
    this.config = config;

    this.nodes = {
      wrapper: null,
      container: null,
      input: null,
      inputHolder: null
    };
  }

  /**
   * @param {EmbedData} data
   * @param {RegExp} [data.regex] - pattern of source URLs
   * @param {string} [data.embedUrl] - URL scheme to embedded page. Use '<%= remote_id %>' to define a place to insert resource id
   * @param {string} [data.html] - iframe which contains embedded content
   * @param {number || string} [data.height] - iframe height
   * @param {number || string} [data.width] - iframe width
   * @param {string} [data.caption] - caption
   */
  set data(data) {
    if (!(data instanceof Object)) {
      throw Error('Embed Tool data should be object');
    }

    const {service, source, embed, width, height, caption = ''} = data;

    this._data = {
      service: service || this.data.service,
      source: source || this.data.source,
      embed: embed || this.data.embed,
      width: width || this.data.width,
      height: height || this.data.height,
      // caption: caption || this.data.caption || '',
    };

    const oldView = this.element;

    if (oldView) {
      oldView.parentNode.replaceChild(this.render(), oldView);
    }
  }

  /**
   * @return {EmbedData}
   */
  get data() {
    if (this.element) {
      const caption = this.element.querySelector(`.${this.api.styles.input}`);

      this._data.caption = caption ? caption.innerHTML : '';
    }

    return this._data;
  }

  /**
   * Get plugin styles
   * @return {Object}
   */
  get CSS() {
    return {
      baseClass: this.api.styles.block,
      inputEl: 'embed-tool__input',
      inputHolder: 'embed-tool__input-holder',
      inputError: 'embed-tool__input-holder--error',
      input: this.api.styles.input,
      container: 'embed-tool',
      containerLoading: 'embed-tool--loading',
      preloader: 'embed-tool__preloader',
      caption: 'embed-tool__caption',
      url: 'embed-tool__url',
      content: 'embed-tool__content'
    };
  }

  /**
   * Render Embed tool content
   *
   * @return {HTMLElement}
   */
  render() {
    if (!this.data.service) {
      const container = document.createElement('div');

      this.nodes.inputHolder = this.makeInputHolder();
      container.appendChild(this.nodes.inputHolder);

      this.element = container;

      return container;
    }

    const {html} = Embed.services[this.data.service];
    const container = document.createElement('div');
    // const caption = document.createElement('div');
    const template = document.createElement('template');
    const preloader = this.createPreloader();

    container.classList.add(this.CSS.baseClass, this.CSS.container, this.CSS.containerLoading);
    // caption.classList.add(this.CSS.input, this.CSS.caption);

    container.appendChild(preloader);

    // caption.contentEditable = true;
    // caption.dataset.placeholder = 'Enter a caption';
    // caption.innerHTML = this.data.caption || '';

    template.innerHTML = html;
    template.content.firstChild.setAttribute('src', this.data.embed);
    template.content.firstChild.classList.add(this.CSS.content);

    const embedIsReady = this.embedIsReady(container);

    container.appendChild(template.content.firstChild);
    // container.appendChild(caption);

    embedIsReady
      .then(() => {
        container.classList.remove(this.CSS.containerLoading);
      });

    this.element = container;

    return container;
  }

  /**
   * Creates preloader to append to container while data is loading
   * @return {HTMLElement} preloader
   */
  createPreloader() {
    const preloader = document.createElement('preloader');
    const url = document.createElement('div');

    url.textContent = this.data.source;

    preloader.classList.add(this.CSS.preloader);
    url.classList.add(this.CSS.url);

    preloader.appendChild(url);

    return preloader;
  }

  /**
   * Save current content and return EmbedData object
   *
   * @return {EmbedData}
   */
  save() {
    return this.data;
  }

  /**
   * Handle pasted url and return Service object
   *
   * @param {PasteEvent} event- event with pasted data
   * @return {Service}
   */
  onPaste(event) {
    this.performServices(event);
  }

  performServices(event) {
    const {key: service, data: url} = event.detail;

    const {regex, embedUrl, width, height, id = (ids) => ids.shift()} = Embed.services[service];
    const result = regex.exec(url).slice(1);
    const embed = embedUrl.replace(/<\%\= remote\_id \%\>/g, id(result));

    this.data = {
      service,
      source: url,
      embed,
      width,
      height
    };
  }

  /**
   * Analyze provided config and make object with services to use
   *
   * @param {EmbedConfig} config
   */
  static prepare({config = {}}) {
    let {services = {}} = config;

    let entries = Object.entries(SERVICES);

    const enabledServices = Object
      .entries(services)
      .filter(([key, value]) => {
        return typeof value === 'boolean' && value === true;
      })
      .map(([ key ]) => key);

    const userServices = Object
      .entries(services)
      .filter(([key, value]) => {
        return typeof value === 'object';
      })
      .filter(([key, service]) => Embed.checkServiceConfig(service))
      .map(([key, service]) => {
        const {regex, embedUrl, html, height, width, id} = service;

        return [key, {
          regex,
          embedUrl,
          html,
          height,
          width,
          id
        } ];
      });

    if (enabledServices.length) {
      entries = entries.filter(([ key ]) => enabledServices.includes(key));
    }

    entries = entries.concat(userServices);

    Embed.services = entries.reduce((result, [key, service]) => {
      if (!(key in result)) {
        result[key] = service;
        return result;
      }

      result[key] = Object.assign({}, result[key], service);
      return result;
    }, {});

    Embed.patterns = entries
      .reduce((result, [key, item]) => {
        result[key] = item.regex;

        return result;
      }, {});
  }

  /**
   * Check if Service config is valid
   *
   * @param {Service} config
   * @return {boolean}
   */
  static checkServiceConfig(config) {
    const {regex, embedUrl, html, height, width, id} = config;

    let isValid = regex && regex instanceof RegExp
      && embedUrl && typeof embedUrl === 'string'
      && html && typeof html === 'string';

    isValid = isValid && (id !== undefined ? id instanceof Function : true);
    isValid = isValid && (height !== undefined ? CSS.supports('height', height) : true);
    isValid = isValid && (width !== undefined ? CSS.supports('width', width) : true);


    return isValid;
  }

  /**
   * Paste configuration to enable pasted URLs processing by Editor
   */
  static get pasteConfig() {
    return {
      patterns: Embed.patterns
    };
  }

  /**
   * Checks that mutations in DOM have finished after appending iframe content
   * @param {HTMLElement} targetNode - HTML-element mutations of which to listen
   * @return {Promise<any>} - result that all mutations have finished
   */
  embedIsReady(targetNode) {
    const PRELOADER_DELAY = 450;

    let observer = null;

    return new Promise((resolve, reject) => {
      observer = new MutationObserver(debounce(resolve, PRELOADER_DELAY));
      observer.observe(targetNode, {childList: true, subtree: true});
    }).then(() => {
      observer.disconnect();
    });
  }

  makeInputHolder() {
    const inputHolder = this.make('div', this.CSS.inputHolder);

    this.nodes.input = this.make('div', [this.CSS.input, this.CSS.inputEl], {
      contentEditable: true
    });

    this.nodes.input.dataset.placeholder = this.config.placeholder || '';

    this.nodes.input.addEventListener('paste', (event) => {
      event.preventDefault();
      event.stopPropagation();

      let url;
      if (event.type === 'paste') {
        url = (event.clipboardData || window.clipboardData).getData('text');
      }

      this.startChecking(url);
    });

    this.nodes.input.addEventListener('keydown', (event) => {
      const [ENTER, A] = [13, 65];
      const cmdPressed = event.ctrlKey || event.metaKey;
      switch (event.keyCode) {
        case ENTER:
          event.preventDefault();
          event.stopPropagation();

          this.startChecking(this.nodes.input.textContent);
          break;
        case A:
          if (cmdPressed) {
            // TODO
          }
          break;
      }
    });

    inputHolder.appendChild(this.nodes.input);

    return inputHolder;
  }

  startChecking(str) {
    const obj = this.matchService(str);

    if (obj) {
      this.performServices(obj)
    } else {
      this.checkFailed('不匹配的地址')
    }
  }

  checkFailed(errorMessage) {
    this.api.notifier.show({
      message: errorMessage,
      style: 'error'
    });

    this.applyErrorStyle();
  }

  /**
   * 输入框中输入回车或粘贴的字符串，验证是否符合预设services
   * @type {Sting}
   * @return {Object}
   *
   */
  matchService(str = '') {

    const ary = str.match(/<iframe.*?\ssrc=(['|"])(.+?)\1.+iframe>/)
    const url = (ary && ary[2]) || str

    if (!url) return

    // match service
    let obj = null
    const services = Embed.services
    for (var key in services) {
      if (services.hasOwnProperty(key)) {
        const { regex } = services[key]
        if (regex.test(url)) {
          obj = this.composePasteEventMock(key, url)
          break
        }
      }
    }

    return obj
  }

  /**
   * set input error style
   */
  applyErrorStyle() {
    this.nodes.inputHolder.classList.add(this.CSS.inputError);
    // this.nodes.progress.remove();
  }

  /**
   * remove error styles
   */
  removeErrorStyle() {
    this.nodes.inputHolder.classList.remove(this.CSS.inputError);
    // this.nodes.inputHolder.insertBefore(this.nodes.progress, this.nodes.input);
  }

  make(tagName, classNames = null, attributes = {}) {
    const el = document.createElement(tagName);

    if (Array.isArray(classNames)) {
      el.classList.add(...classNames);
    } else if (classNames) {
      el.classList.add(classNames);
    }

    for (const attrName in attributes) {
      el[attrName] = attributes[attrName];
    }

    return el;
  }

  composePasteEventMock(service, url) {
    return {
      detail: {
        key: service,
        data: url
      }
    }
  };
}
