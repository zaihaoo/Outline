#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform sampler2D texture;
uniform vec2 pixelSize;
uniform vec4 color;
varying vec2 texCoord;
uniform float u_size;
uniform float time;

const int w = 3;

// 首先根据w计算卷积核(Kernel)的矩阵 譬如2就是5x5的矩阵 3就是7x7的矩阵 由列矩阵[]
const int level = w + (w + 1);
const int size = level * level;

float calcGrads(vec2 p) {
    // 因为后面计算图片的灰度值是float型 所以这里必须是float型 后面才能参与计算 构建两个长度为5的数组 然后两个数组相乘就计算出5x5的矩阵
    float Kx[size];
    float Ky[size];
    float Kx_col[level];
    float Kx_row[level];
    float Ky_col[level];
    float Ky_row[level];

    for (int i = 0; i < level; i++) {
        Kx_col[i] = float(i<=(level-1)/2 ? i+1 : level-i);
        Ky_row[i] = float(i<=(level-1)/2 ? i+1 : level-i);
        if (i < (level-1)/2) {
            Kx_row[i] = float(-i - 1);
            Ky_col[i] = float(i + 1); 
        } else if (i > (level-1)/2) {
            Kx_row[i] = float(-Kx_row[level - 1 - i]);
            Ky_col[i] = float(-Ky_col[level - 1 - i]); 
        } else {
            Kx_row[i] = 0.0;
            Ky_col[i] = 0.0; 
        }
    }

    // 开始分别计算Kx和Ky 算法就是把列矩阵和行矩阵相乘从而生成5x5的矩阵
    for (int r = 0; r < level; r++) {
        for (int c = 0; c < level; c++) {
            Kx[r * level + c] = Kx_col[r] * Kx_row[c];
            Ky[r * level + c] = Ky_col[r] * Ky_row[c];
        }
    }


    // 计算当前像素以及周围像素的灰度值 注意上面计算卷积核的数组是从矩阵左上开始的
    float grayArray[size];

    for (int r = w; r >= -w; r--) {
        for (int c = -w; c <= w; c++) {
            // p 点如果是通过gl_FragCoord.xy取值的 则都需要进行归一化 gl_FragCoord.xy是以viewport视口的大小为参考
            vec4 textureColor = texture2D(texture, (p + vec2(c, r)) / u_size);
            // p 点如果是通过texCoord.xy取值的 则只需要对改变量进行归一化 因为贴图坐标texCoord是经过了varying变量在0到1之间进行插值的 
            // vec4 textureColor = texture2D(texture, p + vec2(c, r) / u_size);
            // 由于c是从-w开始的所以这里和上面有所不同 []中的算法只是为了索引自增
            grayArray[(w - r) * level + (c + w)] = 0.3 * textureColor.r + 0.6 * textureColor.g + 0.1 * textureColor.b;
        }
    }


    // 开始分别计算当前像素X和Y方向的卷积
    float Gx = 0.0;
    float Gy = 0.0;
    for (int index = 0; index < size; index++) {
        Gx += Kx[index] * grayArray[index];
        Gy += Ky[index] * grayArray[index];
    }

    // 根据X和Y方向的卷积生成当前像素的梯值 当梯值大于一定的阈值则可以确定该像素在模型边缘 否则直接丢弃该片元即可
    float G = length(vec2(Gx,Gy));
    return G;
}

void main()
{
    // gl_FragCoord和trxCoord坐标都可以使用 只是texture2D需要注意归一化
    vec2 p = gl_FragCoord.xy / u_size;

    // one line code outline
    // gl_FragColor = vec4(vec3(1.0 - pow(fwidth(texture2D(texture, p / vec2(799.5,799.5)))*15.0, vec4(2)).rgb), 1.0);
    // gl_FragColor = vec4(vec3(pow(fwidth(texture2D(texture,gl_FragCoord.xy/799.5))*8.5,vec4 (2.0)).rgb),1.0);

    // vec2 p = texCoord.xy;

    // if (calcGrads(p) > 0.0) {
    //     gl_FragColor = vec4(
    //         color.r,
    //         color.g,
    //         color.b,
    //         1.0
    //     );
    // } else {
    //     discard;
    // }

    vec4 colorr;
    vec4 finalcolor=texture2D(texture, p);
    float left=texture2D(texture, vec2(p.x+0.003, p.y)).a;
    float right=texture2D(texture, vec2(p.x-0.003, p.y)).a;
    float top=texture2D(texture, vec2(p.x,p.y+0.003)).a;
    float bottom=texture2D(texture, vec2(p.x,p.y-0.003)).a;
    float result=left+right+top+bottom;
    result=result*(1.0-finalcolor.a);

    vec2 te = vec2(1.0) - (mod(p * 3.0,u_size)/u_size);
    float ti = (sin(time) + 1.0) / 2.0;

    if (result != 0.0) {
        if (abs(fract(p.y) - fract(ti)) <= 0.08) {
            vec4 co = vec4(
                p,
                1.0 * p.r,
                color.a
            );
            vec4 ao = vec4(
                sin(time),
                cos(time),
                tan(time),
                1.0
            );
            gl_FragColor = co + ao;
        } else {
            discard;
            // gl_FragColor = vec4(
            //     // sin(time),
            //     // cos(time),
            //     // tan(time),
            //     p,
            //     // te,
            //     1.0 * p.r,
            //     color.a
            // );
        }
    } else {
        discard;
    }
}




