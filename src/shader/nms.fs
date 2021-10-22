precision highp float;
uniform sampler2D texture;
uniform vec2 pixelSize;
uniform vec4 color;
varying vec2 texCoord;
uniform float u_size;

const float PI = radians(180.0);
void main()
{
    vec2 p = gl_FragCoord.xy;
    vec4 thisTextureColor = texture2D(texture, p / u_size);
    if (thisTextureColor.x >= 20.0) {
        // 到这一步可以根据下面几种情况输出一下颜色来判断梯值方向和你假设的梯值方向是不是一样的 从而去修改在sobel计算中的arctan(Gx/Gy) 还是 arctan(Gy/Gx) 来改变梯值方向的计算 因为梯值方向肯定是垂直于边缘方向的
        if (abs(thisTextureColor.y) == PI/2.0) {
            // 梯值方向是垂直的 说明边缘方向是水平方向 取八邻域像素点的上下两个像素进行判断
            vec4 topTextureColor = texture2D(texture, (p + vec2(0,1)) / u_size);
            vec4 bottomTextureColor = texture2D(texture, (p + vec2(0,-1)) / u_size);
            if (max(max(topTextureColor.x,bottomTextureColor.x),thisTextureColor.x) == thisTextureColor.x) {
                gl_FragColor = vec4(
                    thisTextureColor.x,
                    0.0,
                    0.0,
                    0.0
                );
            } else {
                discard;
            }
        } else if(abs(thisTextureColor.y) == 0.0) {
            // 梯值方向是水平的 说明边缘方向是垂直方向 取八邻域像素点的左右两个像素进行判断
            vec4 leftTextureColor = texture2D(texture, (p + vec2(-1,0)) / u_size);
            vec4 rightTextureColor = texture2D(texture, (p + vec2(1,0)) / u_size);
            if (max(max(leftTextureColor.x,rightTextureColor.x),thisTextureColor.x) == thisTextureColor.x) {
                gl_FragColor = vec4(
                    thisTextureColor.x,
                    0.0,
                    0.0,
                    0.0
                );
            } else {
                discard;
            }
        } else if (thisTextureColor.y == PI/4.0) {
            // 梯值方向是45度的方向 这个时候判断左上、右下的像素点
            vec4 leftTopTextureColor = texture2D(texture, (p + vec2(-1,1)) / u_size);
            vec4 rightBottomTextureColor = texture2D(texture, (p + vec2(1,-1)) / u_size);
            if (max(max(leftTopTextureColor.x,rightBottomTextureColor.x),thisTextureColor.x) == thisTextureColor.x) {
                gl_FragColor = vec4(
                    thisTextureColor.x,
                    0.0,
                    0.0,
                    0.0
                );
            } else {
                discard;
            }
        } else if (thisTextureColor.y == -PI/4.0) {
            // 梯值方向是-45度的方向 这个时候判断左下、右上的像素点
            vec4 leftBottomTextureColor = texture2D(texture, (p + vec2(-1,-1)) / u_size);
            vec4 rightTopTextureColor = texture2D(texture, (p + vec2(1,1)) / u_size);
            if (max(max(leftBottomTextureColor.x,rightTopTextureColor.x),thisTextureColor.x) == thisTextureColor.x) {
                gl_FragColor = vec4(
                    thisTextureColor.x,
                    0.0,
                    0.0,
                    0.0
                );
            } else {
                discard;
            }
        } else {
            // 梯值方向是其他方向的 这个时候通过判断梯值方向的正负来判断方向的斜率 同时通过判断梯值方向的数值是否大于PI/4来判断使用y方向的像素点还是使用x方向的像素点来进行计算 大于PI/4用y方向、斜上、斜下的像素点进行计算 小于PI/4用x方向、斜上、斜下的像素点进行计算
            if (thisTextureColor.y > 0.0 && abs(thisTextureColor.y) > PI/4.0) {
                // 左上
                vec4 Alt = texture2D(texture, (p + vec2(-1,1)) / u_size);
                vec4 Bt = texture2D(texture, (p + vec2(0,1)) / u_size);
                float Glt = Bt.x - (Bt.x - Alt.x) / tan(thisTextureColor.y);
                // 右下
                vec4 Ab = texture2D(texture, (p + vec2(0,-1)) / u_size);
                vec4 Brb = texture2D(texture, (p + vec2(1,-1)) / u_size);
                float Grb = Ab.x + (Brb.x - Ab.x) / tan(thisTextureColor.y);

                if (max(max(Glt,Grb),thisTextureColor.x) == thisTextureColor.x) {
                    gl_FragColor = vec4(
                        thisTextureColor.x,
                        0.0,
                        0.0,
                        0.0
                    );
                } else {
                    discard;
                }
                
            } else if (thisTextureColor.y > 0.0 && abs(thisTextureColor.y) < PI/4.0) {
                // 左上
                vec4 Al = texture2D(texture, (p + vec2(-1,0)) / u_size);
                vec4 Blt = texture2D(texture, (p + vec2(-1,1)) / u_size);
                float Glt = Al.x + (Blt.x - Al.x) * tan(thisTextureColor.y);
                // 右下
                vec4 Arb = texture2D(texture, (p + vec2(1,-1)) / u_size);
                vec4 Br = texture2D(texture, (p + vec2(1,0)) / u_size);
                float Grb = Br.x - (Br.x - Arb.x) * tan(thisTextureColor.y);
                
                if (max(max(Glt,Grb),thisTextureColor.x) == thisTextureColor.x) {
                    gl_FragColor = vec4(
                        thisTextureColor.x,
                        0.0,
                        0.0,
                        0.0
                    );
                } else {
                    discard;
                }

            } else if (thisTextureColor.y < 0.0 && abs(thisTextureColor.y) > PI/4.0) {
                // 左下
                vec4 Alb = texture2D(texture, (p + vec2(-1,-1)) / u_size);
                vec4 Bb = texture2D(texture, (p + vec2(0,1)) / u_size);
                float Glb = Bb.x - (Bb.x - Alb.x) / tan(thisTextureColor.y);
                // 右上
                vec4 At = texture2D(texture, (p + vec2(0,1)) / u_size);
                vec4 Brt = texture2D(texture, (p + vec2(1,1)) / u_size);
                float Grt = At.x - (Brt.x - At.x) / tan(thisTextureColor.y);

                if (max(max(Glb,Grt),thisTextureColor.x) == thisTextureColor.x) {
                    gl_FragColor = vec4(
                        thisTextureColor.x,
                        0.0,
                        0.0,
                        0.0
                    );
                } else {
                    discard;
                }
            } else if (thisTextureColor.y < 0.0 && abs(thisTextureColor.y) < PI/4.0) {
                // 左下
                vec4 Alb = texture2D(texture, (p + vec2(-1,-1)) / u_size);
                vec4 Bl = texture2D(texture, (p + vec2(-1,0)) / u_size);
                float Glb = Bl.x - (Bl.x - Alb.x) * tan(thisTextureColor.y);
                //右上
                vec4 Ar = texture2D(texture, (p + vec2(1,0)) / u_size);
                vec4 Brt = texture2D(texture, (p + vec2(1,1)) / u_size);
                float Grt = Ar.x - (Brt.x - Ar.x) * tan(thisTextureColor.y);
                if (max(max(Glb,Grt),thisTextureColor.x) == thisTextureColor.x) {
                    gl_FragColor = vec4(
                        thisTextureColor.x,
                        0.0,
                        0.0,
                        0.0
                    );
                } else {
                    discard;
                }
            }
        }
    } else {
        discard;
    }
}