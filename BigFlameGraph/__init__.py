# Copyright (c) 2016 Ultimaker B.V.
# Cura is released under the terms of the AGPLv3 or higher.

from . import BigFlameGraph

from UM.i18n import i18nCatalog
catalog = i18nCatalog("cura")

def getMetaData():
    return {
        "plugin": {
            "name": "Big Flame Graph",
            "author": "Ultimaker",
            "version": "1.0",
            "description": "Signal profiler with a Big Flame Graph.",
            "api": 3
        }
    }

def register(app):
    return {"extension": BigFlameGraph.BigFlameGraph()}
