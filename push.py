# -*- coding: utf-8 -*-
import os
import re
import requests


def get_urls():
    path = os.path.join(os.path.dirname(__file__), 'content/page/archive.md')
    with open(path) as f:
        content = f.read()
        re_expr = re.compile(r'.*\((.*)\).*')
        result = re_expr.findall(content)
        return result
    return []


def push2baidu(urls):
    print urls
    uri = 'http://data.zz.baidu.com/urls?site=https://www.qikqiak.com&token=dTaKxnO61q8s2qEk'
    headers = {
        'content-type': 'text/plain'
    }
    req = requests.post(uri, data='\n'.join(urls), headers=headers)
    print(req.json())


if __name__ == '__main__':
    push2baidu(get_urls())
