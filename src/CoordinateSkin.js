/*
 * @Author: wuqinfa
 * @Date: 2022-03-11 16:42:56
 * @LastEditors: wuqinfa
 * @LastEditTime: 2022-06-25 15:14:29
 * @Description: 自己新加的功能
 *      创建一个皮肤，实现一个Scratch 网格坐标层
 *
 *  本质上是通过 canvas，把网格画出来，生成一张图片，然后将图片设成渲染器的纹理，让 webgl 渲染纹理
 *      - 重写了 Skin 类 中的 getTexture 函数，使其实现上述事情
 *  CoordinateSkin 类逻辑思路：
 *      - getTexture 函数中调用 _render 函数，通过 _render 函数绘制好网格后，在 getTexture 函数中通过 cxt.getImageData 将绘制的内容转成图片，然后将该图片设置成皮肤纹理
 *      - ps: 处理自定义工具函数外，其它地方很多是抄原本框架的内容，暂时不是很理解具体含义，详细见代码注释
 *
 *  调用/使用逻辑：
 *      1. 在 render 的 src/RenderWebGL.js 定义创建皮肤的函数，并且存储皮肤对应 的 skinId，同时定义工具类函数（更新字体大小、显示 or 隐藏）
 *      2. 在 vm 的 src/engine/runtime.js 调用 render 的函数，创建皮肤，并且绑定一个 drawable 对象，控制展示，同时对接上面 render 中创建的工具函数
 *      3. 在 gui 的 src/containers/stage.jsx 实现，坐标网格展示隐藏、字体放大缩小的业务逻辑
 */

const twgl = require('twgl.js');

const RenderConstants = require('./RenderConstants');
const Skin = require('./Skin');

const DEFAULT_CHECKER_STYLE = {
    // 坐标轴、网格的样式
    axis: {
        lineWidth: 1,
        strokeStyle: '#d8d8d9',
        // strokeStyle: 'rgb(51, 153, 153)',
    },
    // x/y 轴上的坐标点样式
    point: {
        fillStyle: '#d8d8d9',
    },
}

class CoordinateSkin extends Skin {
    /**
     * 创建一个标尺涂层类
     * @param {int} id - The unique ID for this Skin.
     * @param {RenderWebGL} renderer - The renderer which will use this Skin.
     * @extends PenSkin
     */
    constructor(id, renderer) {
        super(id);

        /** @type {RenderWebGL} */
        this._renderer = renderer;

        /** @type {HTMLCanvasElement} */
        // 实例自己创建的一个 canvas ，用于绘制网格
        this._canvas = document.createElement('canvas');

        /** @type {Array<number>} */
        this._size = null;

        /** @type {number} */
        // 抄 src/TextBubbleSkin.js 中的字段，暂时不知道有什么作用
        this._renderedScale = 0;

        /** @type {boolean} */
        // 抄 src/TextBubbleSkin.js 中的字段，暂时不知道有什么作用
        this._textureDirty = true;

        // 保存 canvas 的绘图上下文
        this.ctx = null;

        // 保存网格的样式，暂时不考虑开发设置，感觉也没必要，只需要使用默认样式就好
        this.checkerStyle = DEFAULT_CHECKER_STYLE;

        // x/y 轴，坐标点的字体大小
        this._fontSize = 14;

        // 抄 src/PenSkin.js 的实现，用来设置画布的大小（按理应该是该皮肤纹理的大小）
        /* 2022-06-14 补充：多尺寸变换时，如果还是保留原本的网格 skin 对象会有问题，现在采用的方法是在 vm 项目 src/engine/runtime.js 的 setStageNativeSize 函数，在修改舞台尺寸时
        销毁掉之前的网格并重新创建一个网格对象 */
        // this.onNativeSizeChanged = this.onNativeSizeChanged.bind(this);
        // this._renderer.on(RenderConstants.Events.NativeSizeChanged, this.onNativeSizeChanged);

        this._setCanvasSize(renderer.getNativeSize());
    }

    /**
     * 如果不提供这个函数，渲染器没法获取当前皮肤的大小，将会导致皮肤渲染不出来
     */
    get size () {
        return this._size;
    }

    set fontSize(value) {
        this._fontSize = value;
    }

    /**
     * Dispose of this object. Do not use it after calling this method.
     * 抄 src/TextBubbleSkin.js
     */
     dispose () {
        if (this._texture) {
            this._renderer.gl.deleteTexture(this._texture);
            this._texture = null;
        }
        this._canvas = null;
        super.dispose();
    }

    /**
     * React to a change in the renderer's native size.
     * @param {object} event - The change event.
     *
     * 抄 src/PenSkin.js
     */
    // onNativeSizeChanged (event) {
    //     this._setCanvasSize(event.newSize);
    //     this._textureDirty = true; // 标记成 true 需要重新绘制
    // }

    /**
     * 设置当前皮肤的大小
     */
     _setCanvasSize (canvasSize) {
        const [width, height] = canvasSize;

        this._size = canvasSize;

        // 通过设置 this._rotationCenter ，可以控制当前 skin 在舞台上的渲染起点
        // 默认是[0, 0], 即从舞台正中心进行渲染
        this._rotationCenter[0] = width / 2;
        this._rotationCenter[1] = height / 2;
     }

     /**
      * 设置 canvas 上下文的绘图属性
      * @param {Object} attributes
      */
     _setCtxAttributes (attributes) {
        for (const key in attributes) {
            this.ctx[key] = attributes[key];
        }
     }

     /**
      * 根据(x0, y0)，(x1, y1) 画一条线
      * @param {number} x0
      * @param {number} y0
      * @param {number} x1
      * @param {number} y1
      */
     _drawLine (x0, y0, x1, y1) {
        this.ctx.beginPath();
        this.ctx.moveTo(this._rotationCenter[0] + x0, this._rotationCenter[1] + y0);
        this.ctx.lineTo(this._rotationCenter[0] + x1, this._rotationCenter[1] + y1);
        this.ctx.stroke();
    }

    /**
     * 在 (x, y) 除画文字
     * @param {string} text
     * @param {number} x
     * @param {number} y
     */
    _drawText (text, x, y) {
        this.ctx.fillText(text, this._rotationCenter[0] + x, this._rotationCenter[1] + y);
    }

    /**
     *  画网格的轴
     * @param {Object} axisData
     */
    _drawAxis (axisData) {
        const {
            coordinates,
            coordPoints,
            attributes,
        } = axisData;

        // 设置 网格 轴的绘制属性，并且进行绘制
        this._setCtxAttributes(attributes.axis);
        for (let index = 0; index < coordinates.length; index++) {
            const item = coordinates[index];
            const {
                x0, y0,
                x1, y1,
            } = item;

            this._drawLine(x0, y0, x1, y1);
        }

        // 设置x/y 轴上的坐标点的绘制属性，并且进行绘制
        this.ctx.font = `${this._fontSize}px sans-serif`;
        this.ctx.textBaseline = 'top';
        this.ctx.textAlign = 'center';
        this._setCtxAttributes(attributes.point);
        for (let index = 0; index < coordPoints.length; index++) {
            const item = coordPoints[index];
            const { text, x, y } = item;

            this._drawText(text, x, y);
        }
    }

    /**
     * 获取 x/y 主坐标轴数据
     * @returns axisData
     */
    _getMainAxis () {
        const maxX = this._size[0];
        const maxY = this._size[1];
        const axisAttributes = this.checkerStyle.axis;
        const pointAttributes = this.checkerStyle.point;

        return {
            coordinates: [
                {
                    x0: maxX, y0: 0,
                    x1: -maxX, y1: 0,
                },
                {
                    x0: 0, y0: maxY,
                    x1: 0, y1: -maxY,
                }
            ],
            coordPoints: [
                {
                    text: 0, x: 0, y: 0,
                }
            ],
            attributes: {
                axis: {
                    strokeStyle: axisAttributes.strokeStyle,
                    lineWidth: axisAttributes.lineWidth * 2,
                },
                point: pointAttributes,
            },
        };
    }

    /**
     * 获取网格轴的数据
     * @param {*} interval 轴间隔，默认按 100 作为一个大的单位
     * @param {*} isNeedCoordPoint 轴上是否显示坐标点，默认只有当 100 间隔时才显示坐标点
     * @returns axisData
     */
    _getGridAxis (interval = 100, isNeedCoordPoint = true) {
        const maxX = this._size[0];
        const maxY = this._size[1];
        const axisAttributes = this.checkerStyle.axis;
        const pointAttributes = this.checkerStyle.point;

        const coordinates = [];
        const coordPoints = [];

        let stepX = interval;
        let stepY = interval;

        while (stepX < maxX) {
            coordinates.push({
                x0: stepX, y0: maxY,
                x1: stepX, y1: -maxY,
            });
            coordinates.push({
                x0: -stepX, y0: maxY,
                x1: -stepX, y1: -maxY,
            });

            coordPoints.push({
                text: stepX, x: stepX, y: 0,
            });
            coordPoints.push({
                text: -stepX, x: -stepX, y: 0,
            });

            stepX += interval;
        }

        while (stepY < maxY) {
            coordinates.push({
                x0: maxX, y0: stepY,
                x1: -maxX, y1: stepY,
            });
            coordinates.push({
                x0: maxX, y0: -stepY,
                x1: -maxX, y1: -stepY,
            });

            coordPoints.push({
                text: -stepY, x: 0, y: stepY,
            });
            coordPoints.push({
                text: stepY, x: 0, y: -stepY,
            });

            stepY += interval;
        }

        return {
            coordinates,
            coordPoints: isNeedCoordPoint ? coordPoints : [],
            attributes: {
                axis: {
                    strokeStyle: axisAttributes.strokeStyle,
                    lineWidth: isNeedCoordPoint ? axisAttributes.lineWidth : axisAttributes.lineWidth * 0.7,
                },
                point: pointAttributes,
            },
        };
    }

    _render (scale) {
        this.ctx = this._canvas.getContext('2d');

        // this._canvas.width = Math.ceil(this._size[0] * scale);
        // this._canvas.height = Math.ceil(this._size[1] * scale);
        this._canvas.width = Math.ceil(this._size[0]);
        this._canvas.height = Math.ceil(this._size[1]);

        const mainAxis = this._getMainAxis();
        const unitAxis = this._getGridAxis();
        const detailsAxis = this._getGridAxis(20, false);

        this._drawAxis(mainAxis);
        this._drawAxis(unitAxis);
        this._drawAxis(detailsAxis);

        // this._renderedScale = scale;
    }

    getTexture (scale) {
        // const scaleMax = scale ? Math.max(Math.abs(scale[0]), Math.abs(scale[1])) : 100;
        // const requestedScale = scaleMax / 100;

        // if (this._textureDirty || this._renderedScale !== requestedScale) {
        // 暂时不清楚 requestedScale 有什么作用，就算是高倍屏，直接按 1 倍的画也可以
        if (this._textureDirty) {
            this._render();
            this._textureDirty = false;

            const textureData = this.ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);

            const gl = this._renderer.gl;

            if (this._texture === null) {
                const textureOptions = {
                    auto: false,
                    wrap: gl.CLAMP_TO_EDGE
                };

                this._texture = twgl.createTexture(gl, textureOptions);
            }

            this._setTexture(textureData);
        }

        return this._texture;
    }
}

module.exports = CoordinateSkin;
