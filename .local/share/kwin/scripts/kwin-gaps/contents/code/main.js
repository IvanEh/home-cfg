(function () {
    "use strict";
    var MAX_LEVEL = 3
    var DEBUG = true 
    var clientMaximizedStateChangedOverload1 = 'clientMaximizedStateChanged(KWin::AbstractClient*,bool,bool)'
    var clientMaximizedStateChangedOverload2 = 'clientMaximizedStateChanged(KWin::AbstractClient*,MaximizeMode)'
    var realPrint = this.print
    var print = function(arg) { if (DEBUG) realPrint.apply(this, arguments) }

    
    var panelMargin = {
        top: 27
    }
    var gaps = {
        top: 8,
        bottom: 12,
        left: 16,
        right: 16,
        center: 8
    }
    
    print(inspect(workspace))
    loadConfigs()
    registerEventListeners()


    function registerEventListeners() {
        options.configChanged.connect(tryReloadConfigs)

        var clients = workspace.clientList();
        for (var i = 0; i < clients.length; i++) {
            registerClient(clients[i]);
        }

        workspace.clientAdded.connect(function(client) {
            registerClient(client)
        })
    }

    function updateAllClients() {
        for (var i = 0; i < clients.length; i++) {
            updateGaps(clients[i]);
        }
    }

    function tryReloadConfigs() {
        if(loadConfigs())
            updateAllClients()
    }

    function registerClient(client) {
        if (client.specialWindow) return;
        
        client.clientFinishUserMovedResized.connect(updateGaps)
        client[clientMaximizedStateChangedOverload1].connect(updateGaps)
        client[clientMaximizedStateChangedOverload2].connect(updateGaps)
        client.quickTileModeChanged.connect(function(client) {
            return function(){ updateGaps(client) }
        }(client))
        updateGaps(client)
    }

    function loadConfigs() {
        var updated = { status: false }
        gaps.top = readIntegerConfigWithStatus('top', gaps.top, updated)
        gaps.left = readIntegerConfigWithStatus('left', gaps.left, updated)
        gaps.right = readIntegerConfigWithStatus('right', gaps.right, updated)
        gaps.bottom = readIntegerConfigWithStatus('bottom', gaps.bottom, updated)
        panelMargin.top = readIntegerConfigWithStatus('topPanelMargin', panelMargin.top, updated)
        print('updated config', inspect(gaps), inspect(panelMargin), inspect(updated))
        return updated.status
    }

    function readIntegerConfigWithStatus(paramName, currentValue, statusHolder) {
        var value = +readConfig(paramName, currentValue)
        print('config ', paramName, 'is', readConfig(paramName, 'default'))
        if (value != currentValue) {
            statusHolder.status = true
        }
        return value
    }

    function updateGaps(client) {
        if (client.specialWindow) return;
        
        print('client', client.caption)
        print('client.geometry', inspect(client.geometry))

        tryReloadConfigs()

        var currClientGeometry = client.geometry
        var newClientGeometry = { x: currClientGeometry.x, y: currClientGeometry.y, width: currClientGeometry.width, height: currClientGeometry.height }

        var verticalTransform = getTransformationForPush(calculateVerticalPush(currClientGeometry))
        var horizontalTransform = getTransformationForPush(calculateHorizontalPush(currClientGeometry))
        print('verticalTransform', inspect(verticalTransform))
        print('horizontalTransform', inspect(horizontalTransform))

        newClientGeometry.x = currClientGeometry.x + verticalTransform.translation
        newClientGeometry.width = currClientGeometry.width - verticalTransform.shrink        
        newClientGeometry.y = currClientGeometry.y + horizontalTransform.translation
        newClientGeometry.height = currClientGeometry.height - horizontalTransform.shrink        

        client.geometry = newClientGeometry
    }

    function calculateVerticalPush(clientGeometry) {
        var leftPush = calculatePush(0, gaps.left, +1, clientGeometry.x)
        var rightPush = calculatePush(workspace.workspaceWidth, gaps.right, -1, clientGeometry.x + clientGeometry.width)
        var verticalCenterPushForRightBorder =
            calculatePush(workspace.workspaceWidth / 2, gaps.center, -1, clientGeometry.x + clientGeometry.width)
        var verticalCenterPushForLeftBorder =
            calculatePush(workspace.workspaceWidth / 2, gaps.center, +1, clientGeometry.x)
        var verticalPush = combinePushes([leftPush, rightPush, verticalCenterPushForRightBorder, verticalCenterPushForLeftBorder])

        print('verticle pushes', inspect([leftPush, rightPush, verticalCenterPushForRightBorder, verticalCenterPushForLeftBorder]))
        print('verticalPush', inspect(verticalPush))

        return verticalPush
    }

    function calculateHorizontalPush(clientGeometry) {
        var center = panelMargin.top + (workspace.workspaceHeight - panelMargin.top) / 2
        var topPush = calculatePush(panelMargin.top, gaps.top, +1, clientGeometry.y)
        var bottomPush = calculatePush(workspace.workspaceHeight, gaps.bottom, -1, clientGeometry.y + clientGeometry.height)

        var horizCenterPushForRightBorder =
            calculatePush(center, gaps.center, -1, clientGeometry.y + clientGeometry.height)
        var horizCenterPushForLeftBorder =
            calculatePush(center, gaps.center, +1, clientGeometry.y)
        var horizPush = combinePushes([topPush, bottomPush, horizCenterPushForRightBorder, horizCenterPushForLeftBorder])

        print('horiz pushes', inspect([topPush, bottomPush, horizCenterPushForRightBorder, horizCenterPushForLeftBorder]))
        print('horiz total push', inspect(horizPush))

        return horizPush
    }

    function getTransformationForPush(push) {
        if (push.positive > 0) {
            if (push.negative > 0) {
                return {
                    translation: push.positive,
                    shrink: push.positive + push.negative
                }
            }

            return {
                translation: push.positive,
                shrink: 0
            }
        }

        return {
            translation: - push.negative,
            shrink: 0
        }
    }

    function combinePushes(pushes) {
        return {
            positive: Math.max.apply(Math, pushes.map(function(p) { return p.positive })),
            negative: Math.max.apply(Math, pushes.map(function(p) { return p.negative }))
        }
    }

    function calculatePush(origin, margin, pushPreference, point) {
       if (point >= origin && point <= origin + margin) {
           if (pushPreference == -1 ) {
               return {
                   positive: 0, 
                   negative: point - origin + margin
               }
           } else {
               return {
                   positive: (origin + margin) - point,
                   negative: 0
               }
           }
       } 
       if (point < origin && point > origin - margin) {
            if (pushPreference == +1) {
                return {
                    positive: (origin - point) + margin,
                    negative: 0
                }
            } else if (point > origin - margin) {
                return {
                    positive: 0,
                    negative: point - (origin - margin)
                }
            }
       }
       return {
          positive: 0,
          negative: 0
       }
    }

    function debugAllSignals(o) {
        for (key in o) {
            if (o[key] instanceof Object) {
                if(o[key].connect) {
                    o[key].connect(function() {
                        print('Calling', key)
                    })
                }
            }
        }
    }

    function inspect(o, level) {
        level = level || 0
        if (level >= MAX_LEVEL || !DEBUG) {
            return '..'
        }
        var result = ''
        for (key in o) {
            if (o[key] instanceof Object) {
                if (o[key].connect) {
                    result += key + '=Signal(),'
                } else {
                    result += key + '={\n' + inspect(o[key], level + 1) + '\n}'
                }
            } else {
                result += key + '=' + o[key] + ','
            }
        }
        return result
    }
})();

