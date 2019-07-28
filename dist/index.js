function isPlainObject(val) {
  return Object.prototype.toString.call(val) === '[object Object]'
}

/**
 * 对象合并，浅克隆,后面参数的值会覆盖前面的值,所有参数必须是一个对象Object
 * */
function objMerge() {
  let args = Array.from(arguments);
  if (args.length > 1) {
    for (let i = 1; i < args.length; i++) {
      for (let key in args[i]) {
        if (args[i].hasOwnProperty(key)) {
          args[0][key] = args[i][key];
        }
      }
    }
  }
  return args[0];
}

class Store {
  constructor(option = {}) {
    this.easyMode = !!option.easyMode
    this.bindStorageMode = !!option.bindStorageMode
    let _state_
    if (this.bindStorageMode) {
      _state_ = option.state || {}
    } else {
      _state_ = this._unifyStateStyle(option.state)
    }
    this.state = this._initState(_state_)
    console.log(this.state)
    this.mutation = option.mutation || {}
    if (this.easyMode) {
      this._polyfillMutation(this.mutation, _state_)
    }
  }

  // state序列化 {userInfo: {
  //      persistence: true,
  //         default: ''
  //  }
  // }
  _initState(_state_ = {}) {
    console.log(_state_)
    let state = {}
    Object.keys(_state_).forEach(key => {
      if (_state_[key].persistence) {
        state[key] = this._getStorage(key, _state_[key].default)
      } else {
        state[key] = _state_[key].default
      }
    })
    return state
  }

  _unifyStateStyle(state = {}) {
    let _state_ = {}
    Object.keys(state).forEach(key => {
      _state_[key] = {
        default: state[key]
      }
    })
    return _state_
  }

  _setStorage(key, data) {
    wx.setStorage({
      key,
      data
    })
  }

  /**
   * 取不到值，则返回默认值
   * */

  _getStorage(key, def) {
    console.log(key)
    let res = wx.getStorageSync(key)
    console.log(res === '')
    return res !== '' ? res : def
  }

  /**
   * 补齐mutation, 遍历state,如果没有写state，则补全state
   * mutation[key] = (state, payload) => {
   *      state[key] = payload
   * }
   * */
  _polyfillMutation(mutation = {}, _state_ = {}) {
    Object.keys(_state_).forEach(key => {
      if (!mutation[key] || typeof mutation[key] !== 'function') {
        mutation[key] = (state, payload) => {
          state[key] = payload
        }
      }
      mutation[key].persistence = !!_state_[key].persistence
    })
  }

  commit(type, payload) {
    this.mutation[type](this.state, payload)
    // 如果需要持久化，则存入缓存
    if (this.mutation[type].persistence) {
      this._setStorage(type, this.state[type])
    }
    // 如果有订阅序列，则更新
    if (this.registerQueue[type]) {
      this.registerQueue[type].forEach(context => {
        this.assignment(context, type, this.state[type])
      })
    }
  }

  /*
  * 赋值操作, 将值赋遇到上下文（这里指页面或组件）的data中，调用组件或页面的setData方法
  * @
  */
  assignment(context, key, value) {
    if (!context.setData) {
      console.error('Context not has setData method of assignment')
    }
    let obj = {}
    obj[key] = value
    context.setData(obj)
  }

  registerQueue = {}

  // 注册订阅列表
  registe(types = [], context) {
    // 注册时给定初始值，将其映射到页面或组件上
    types.forEach(type => {
      this.assignment(context, type, this.state[type])
      // 如果队列未注册，则添加一个空数组
      if (!this.registerQueue[type]) {
        this.registerQueue[type] = []
      }
      // 如果不存在该页面实例， 则push
      if (this.registerQueue[type].indexOf(context) < 0) {
        this.registerQueue[type].push(context)
      }
    })


  }

  install(needMount) {
    if (needMount && !isPlainObject(needMount)) {
      console.error('[minax]:The parameter of installer must be a plain object!')
      return
    }
    let _store = this
    let _needMount = needMount || {}
    // 将$store修正为实例
    _needMount.$store = _store
    // 待安装队列
    let fns = [App, Page, Component, Behavior]
    // 组件类函数， 包括Component, Behavior
    let componentLikeFns = [Component, Behavior]
    fns.forEach(originFn => {
      // 劫持后的函数
      const highjackedFn = (config) => {
        !config && (config = {})
        // 携带path的基本是组件了
        // 旧的注入方法
        // config.$store = this
        let firstLifeHookName = (componentLikeFns.indexOf(originFn) > -1) ? 'attached' : 'onLoad'
        !config[firstLifeHookName] && (config[firstLifeHookName] = function () {
        })
        const originFirstLifeHook = config[firstLifeHookName]
        config[firstLifeHookName] = function () {
          // 将方法注入进this,达到处处this.的调用
          objMerge(this, _needMount)
          if (config.mapState) {
            // 接受传入的数据，传的是数组，则返回数组，如果传的是字符串，则使用字符串
            // TODO，后期会改成接受key: value的形式，key 为type, 可以是getter函数的形式，达成类似vuex的效果
            let list = []
            if (Array.isArray(config.mapState)) {
              list = config.mapState
            } else if (typeof config.mapState === 'string') {
              list.push(config.mapState)
            }
            _store.registe(list, this)
          }
          originFirstLifeHook.apply(this, arguments)
        }
        // TODO 后期会增加对卸载的处理
        originFn(config)
      }
      switch (originFn) {
        case App:
          App = highjackedFn
          break;
        case Page:
          Page = highjackedFn
          break;
        case Component:
          Component = highjackedFn
          break;
        case Behavior:
          Behavior = highjackedFn
          break;
        default:
          return
      }
    })
  }
}

module.exports = Store
