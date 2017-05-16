import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

//	构造函数
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }

  //	/src/core/instance/init.js
  this._init(options)
}

//	初始化的入口，各种初始化工作
initMixin(Vue)

//	数据绑定的核心方法，常用的$watch方法
stateMixin(Vue)

//	事件的核心方法，$on，$off，$emit等方法
eventsMixin(Vue)

//	生命周期的核心方法
lifecycleMixin(Vue)

//	渲染的核心方法，用来生成render函数以及VNode
renderMixin(Vue)

export default Vue
