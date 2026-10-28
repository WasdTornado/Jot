import Foundation
import Darwin

struct DocumentFiles {
    var copyDirectory: (URL, URL) throws -> Void = { try FileManager.default.copyItem(at: $0, to: $1) }
    var swapDirectories: (URL, URL) throws -> Void = { first, second in
        guard renameatx_np(AT_FDCWD, first.path, AT_FDCWD, second.path, UInt32(RENAME_SWAP)) == 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
    }
    var read: (URL) throws -> Data = { try Data(contentsOf: $0) }
    var atomicWrite: (Data, URL) throws -> Void = { try $0.write(to: $1, options: .atomic) }
    var list: (URL) throws -> [URL] = { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) }
    var remove: (URL) throws -> Void = { try FileManager.default.removeItem(at: $0) }
    var exists: (URL) -> Bool = { FileManager.default.fileExists(atPath: $0.path) }
    var createDirectory: (URL) throws -> Void = { try FileManager.default.createDirectory(at: $0, withIntermediateDirectories: true) }
}
