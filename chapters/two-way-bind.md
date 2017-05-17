## 双向绑定实现

在上一篇前面部分贴出了上面的Vue构造器的相关代码,在构造器下面一共调用了5个方法来给```Vue.prototype```添加相关方法,关于第一个已经在前面说过,第二个方法是```stateMixin```,也就是数据绑定的相关方法,一起来看看双向绑定是实现原理:

###### 双向绑定:

```stateMixin```是在```/src/core/instance/state.js```里面实现的



```javascript
//	vm: Vue组件实例
export function initState (vm: Component) {
  //  被观察的对象列表
  vm._watchers = []
  
  /*  缓存合并过后的$options
  
  	/src/core/instance/init.js
  	vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
  */
  const opts = vm.$options
  
  //  组件中传入了props
  if (opts.props) initProps(vm, opts.props)
  
  //  组件中传入了methods
  if (opts.methods) initMethods(vm, opts.methods)
  
  //  组件中传入了data
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  
  //  组件中传入了computed
  if (opts.computed) initComputed(vm, opts.computed)
  
  //  组件中传入了watch
  if (opts.watch) initWatch(vm, opts.watch)
}
```



###### initProps:

initProps主要用于处理在组件被实例化时传入的propsData,拿一个官方文档的例子:

```html
//	a.vue
<template>
  <div>
  	<p v-text="msg">
    </p>
  </div>
</template>

<script>
	export default {
       name: "A",
       props: {
         msg: {
           type: String,
           required: true
         }
       }
	}
</script>

//	b.vue
<template>
  <div>
  	<a :msg="msg"></a>
  </div>
</template>

<script>
  	import A from "path/to/a.vue";
	export default {
       name: "B",
       data() {
         return {
           msg: "hello vue"
         }
       },
      components: {
        a: A
      }
	}
</script>


```

在Vue中的prop是单向绑定的,就拿上面的例子来说,如果B组件里面的msg发生改变,是会传给A组件的,但不会反过来,下面一起来看下具体实现:

```javascript
function initProps (vm: Component, propsOptions: Object) {
  //  接收实例化时传入的propsData
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}

  //  用于缓存propsData的键名数组(Object.keys),
  //  如果后面propsData的属性值有更新,只需遍历数组,无需采用for...in来枚举对象
  const keys = vm.$options._propKeys = []
  
  //  是否为根组件
  const isRoot = !vm.$parent
  
  //  根组件的shouldConvert为true
  observerState.shouldConvert = isRoot
  for (const key in propsOptions) {
    keys.push(key)
    
    //  对当前属性值进行验证,实现在下面进行解析
    const value = validateProp(key, propsOptions, propsData, vm)
    
    if (process.env.NODE_ENV !== 'production') {
      if (isReservedProp[key] || config.isReservedAttr(key)) {
        warn(
          `"${key}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      
      //  响应式里面最重要的一个方法,最后进行解释
      defineReactive(props, key, value, () => {
        if (vm.$parent && !observerState.isSettingProps) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }

    //  当前组件实例中不包含这个key,放到vm._props下面,proxy方法具体实现在下面
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  observerState.shouldConvert = true
}
```



###### proxy:

从proxy这个方法可以看到,就是调用了一下ES5的```Object.defineProperty```把给对象绑定```getter```和```setter```方法,并没有做特殊处理

```javascript
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
```



###### validateProp:

该方法主要用于验证传入的参数和指定的参数类似是否一致