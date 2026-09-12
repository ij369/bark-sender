//
//  SafariWebExtensionHandler.swift
//  Bark Sender Extension
//
//  Created by FEI on 11/11/2025.
//

import SafariServices
import os.log
import AppKit

let SFExtensionMessageKey = "message"

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

	func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems[0] as! NSExtensionItem
        let message = item.userInfo?[SFExtensionMessageKey]
        
        os_log(.default, "Received message from browser.runtime.sendNativeMessage: %@", message as! CVarArg)
        
        // 处理来自扩展的消息
        if let messageDict = message as? [String: Any],
           let action = messageDict["action"] as? String {
            
            switch action {
            case "readClipboard":
                handleReadClipboard(context: context)
                return
            case "ping":
                handlePing(context: context)
                return
            default:
                break
            }
        }
        
        // 默认响应
        let response = NSExtensionItem()
        response.userInfo = [ SFExtensionMessageKey: [ "Response to": message ] ]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
    
    private func handleReadClipboard(context: NSExtensionContext) {
        let pasteboard = NSPasteboard.general
        var responseData: [String: Any] = [
            "success": false,
            "data": "",
            "type": "unknown"
        ]
        
        // 检查剪切板中是否有文本内容
        if let clipboardText = pasteboard.string(forType: .string) {
            responseData = [
                "success": true,
                "data": clipboardText,
                "type": "text"
            ]
            os_log(.default, "Successfully read clipboard text: %@", clipboardText)
        } else {
            // 检查是否有其他类型的内容
            let types = pasteboard.types ?? []
            if types.contains(.fileURL) {
                responseData = [
                    "success": false,
                    "data": "Clipboard contains file(s), not supported",
                    "type": "file"
                ]
            } else if types.contains(.tiff) || types.contains(.png) {
                responseData = [
                    "success": false,
                    "data": "Clipboard contains image, not supported",
                    "type": "image"
                ]
            } else {
                responseData = [
                    "success": false,
                    "data": "Clipboard is empty or contains unsupported content",
                    "type": "empty"
                ]
            }
            os_log(.default, "Clipboard read failed or unsupported content type")
        }
        
        let response = NSExtensionItem()
        response.userInfo = [ SFExtensionMessageKey: responseData ]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
    
    private func handlePing(context: NSExtensionContext) {
        os_log(.default, "Received ping from extension")
        
        let responseData: [String: Any] = [
            "success": true,
            "message": "pong",
            "timestamp": Date().timeIntervalSince1970
        ]
        
        let response = NSExtensionItem()
        response.userInfo = [ SFExtensionMessageKey: responseData ]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
