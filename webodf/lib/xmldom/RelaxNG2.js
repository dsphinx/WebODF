/**
 * Copyright (C) 2011 KO GmbH <jos.van.den.oever@kogmbh.com>
 * @licstart
 * The JavaScript code in this page is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License
 * (GNU AGPL) as published by the Free Software Foundation, either version 3 of
 * the License, or (at your option) any later version.  The code is distributed
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU AGPL for more details.
 *
 * As additional permission under GNU AGPL version 3 section 7, you
 * may distribute non-source (e.g., minimized or compacted) forms of
 * that code without the copy of the GNU GPL normally required by
 * section 4, provided you include this license notice and a URL
 * through which recipients can access the Corresponding Source.
 *
 * As a special exception to the AGPL, any HTML file which merely makes function
 * calls to this code, and for that purpose includes it by reference shall be
 * deemed a separate work for copyright law purposes. In addition, the copyright
 * holders of this code give you permission to combine this code with free
 * software libraries that are released under the GNU LGPL. You may copy and
 * distribute such a system following the terms of the GNU AGPL for this code
 * and the LGPL for the libraries. If you modify this code, you may extend this
 * exception to your version of the code, but you are not obligated to do so.
 * If you do not wish to do so, delete this exception statement from your
 * version.
 *
 * This license applies to this entire compilation.
 * @licend
 * @source: http://www.webodf.org/
 * @source: http://gitorious.org/odfkit/webodf/
 */
/*global runtime xmldom*/

/**
 * RelaxNG can check a DOM tree against a Relax NG schema
 * The RelaxNG implementation is currently not complete. Relax NG should not
 * report errors on valid DOM trees, but it will not check all constraints that
 * a Relax NG file can define. The current implementation does not load external
 * parts of a Relax NG file.
 * The main purpose of this Relax NG engine is to validate runtime ODF
 * documents. The DOM tree is traversed via a TreeWalker. A custom TreeWalker
 * implementation can hide parts of a DOM tree. This is useful in WebODF, where
 * special elements and attributes in the runtime DOM tree.
runtime.loadClass("xmldom.RelaxNGParser");
 */
/**
 * @constructor
 * @param {!string} url path to the Relax NG schema
 */
xmldom.RelaxNG2 = function RelaxNG2(url) {
    var rngns = "http://relaxng.org/ns/structure/1.0",
        xmlnsns = "http://www.w3.org/2000/xmlns/",
        start,
        validateNonEmptyPattern,
        nsmap,
        depth = 0,
        p = "                                                                ",
        
/*== implementation according to
 *   http://www.thaiopensource.com/relaxng/derivative.html */
        createChoice,
        createInterleave,
        createGroup,
        createAfter,
        createOneOrMore,
        createValue,
        createAttribute,
        createNameClass,
        createData,
        makePattern,
        notAllowed = {
            type: "notAllowed",
            nullable: false,
            hash: "notAllowed",
            textDeriv: function () { return notAllowed; },
            startTagOpenDeriv: function () { return notAllowed; },
            attDeriv: function () { return notAllowed; },
            startTagCloseDeriv: function () { return notAllowed; },
            endTagDeriv: function () { return notAllowed; }
        },
        empty = {
            type: "empty",
            nullable: true,
            hash: "empty",
            textDeriv: function () { return notAllowed; },
            startTagOpenDeriv: function () { return notAllowed; },
            attDeriv: function (context, attribute) { return notAllowed; },
            startTagCloseDeriv: function () { return empty; },
            endTagDeriv: function () { return notAllowed; }
        },
        text = {
            type: "text",
            nullable: true,
            hash: "text",
            textDeriv: function () { return text; },
            startTagOpenDeriv: function () { return notAllowed; },
            attDeriv: function () { return notAllowed; },
            startTagCloseDeriv: function () { return text; },
            endTagDeriv: function () { return notAllowed; }
        },
        applyAfter,
        childDeriv,
        rootPattern;

    function memoize0arg(func) {
        return (function () {
            var cache;
            return function () {
                if (cache === undefined) {
                    cache = func();
                }
                return cache;
            };
        }());
    }
    function memoize1arg(type, func) {
        return (function () {
            var cache = {}, cachecount = 0;
            return function (a) {
                var ahash = a.hash || a.toString(),
                    v;
                v = cache[ahash];
                if (v !== undefined) {
                    return v;
                }
                cache[ahash] = v = func(a);
                v.hash = type + cachecount.toString();
                cachecount += 1;
                return v;
            };
        }());
    }
    function memoizeNode(func) {
        return (function () {
            var cache = {};
            return function (node) {
                var v, m;
                m = cache[node.localName];
                if (m === undefined) {
                    cache[node.localName] = m = {};
                } else {
                    v = m[node.namespaceURI];
                    if (v !== undefined) {
                        return v;
                    }
                }
                m[node.namespaceURI] = v = func(node);
                return v;
            };
        }());
    }
    function memoize2arg(type, fastfunc, func) {
        return (function () {
            var cache = {}, cachecount = 0;
            return function (a, b) {
                var v = fastfunc && fastfunc(a, b),
                    ahash, bhash, m;
                if (v !== undefined) { return v; }
                ahash = a.hash || a.toString();
                bhash = b.hash || b.toString();
                m = cache[ahash];
                if (m === undefined) {
                    cache[ahash] = m = {};
                } else {
                    v = m[bhash];
                    if (v !== undefined) {
                        return v;
                    }
                }
                m[bhash] = v = func(a, b);
                v.hash = type + cachecount.toString();
                cachecount += 1;
                return v;
            };
        }());
    }
    // this memoize function can be used for functions where the order of two
    // arguments is not important
    function unorderedMemoize2arg(type, fastfunc, func) {
        return (function () {
            var cache = {}, cachecount = 0;
            return function (a, b) {
                var v = fastfunc && fastfunc(a, b),
                    ahash, bhash, m;
                if (v !== undefined) { return v; }
                ahash = a.hash || a.toString();
                bhash = b.hash || b.toString();
                if (ahash < bhash) {
                    m = ahash; ahash = bhash; bhash = m;
                    m = a; a = b; b = m;
                }
                m = cache[ahash];
                if (m === undefined) {
                    cache[ahash] = m = {};
                } else {
                    v = m[bhash];
                    if (v !== undefined) {
                        return v;
                    }
                }
                m[bhash] = v = func(a, b);
                v.hash = type + cachecount.toString();
                cachecount += 1;
                return v;
            };
        }());
    }
    function getUniqueLeaves(leaves, pattern) {
        if (pattern.p1.type === "choice") {
            getUniqueLeaves(leaves, pattern.p1);
        } else {
            leaves[pattern.p1.hash] = pattern.p1;
        }
        if (pattern.p2.type === "choice") {
            getUniqueLeaves(leaves, pattern.p2);
        } else {
            leaves[pattern.p2.hash] = pattern.p2;
        }
    }
    createChoice = memoize2arg("choice", function (p1, p2) {
        if (p1 === notAllowed) { return p2; }
        if (p2 === notAllowed) { return p1; }
        if (p1 === p2) { return p1; }
    }, function (p1, p2) {
        function makeChoice(p1, p2) {
            return {
                type: "choice",
                p1: p1,
                p2: p2,
                nullable: p1.nullable || p2.nullable,
                textDeriv: function (context, text) {
                    return createChoice(p1.textDeriv(context, text),
                        p2.textDeriv(context, text));
                },
                startTagOpenDeriv: memoizeNode(function (node) {
                    return createChoice(p1.startTagOpenDeriv(node),
                        p2.startTagOpenDeriv(node));
                }),
                attDeriv: function (context, attribute) {
                    return createChoice(p1.attDeriv(context, attribute),
                        p2.attDeriv(context, attribute));
                },
                startTagCloseDeriv: memoize0arg(function () {
                    return createChoice(p1.startTagCloseDeriv(),
                        p2.startTagCloseDeriv());
                }),
                endTagDeriv: memoize0arg(function () {
                    return createChoice(p1.endTagDeriv(), p2.endTagDeriv());
                })
            };
        }
        var leaves = {}, i;
        getUniqueLeaves(leaves, {p1: p1, p2: p2});
        p1 = undefined;
        p2 = undefined;
        for (i in leaves) {
            if (leaves.hasOwnProperty(i)) {
                if (p1 === undefined) {
                    p1 = leaves[i];
                } else if (p2 === undefined) {
                    p2 = leaves[i];
                } else {
                    p2 = createChoice(p2, leaves[i]);
                }
            }
        }
        return makeChoice(p1, p2);
    });
    createInterleave = unorderedMemoize2arg("interleave", function (p1, p2) {
        if (p1 === notAllowed || p2 === notAllowed) { return notAllowed; }
        if (p1 === empty) { return p2; }
        if (p2 === empty) { return p1; }
    }, function (p1, p2) {
        return {
            type: "interleave",
            p1: p1,
            p2: p2,
            nullable: p1.nullable && p2.nullable,
            textDeriv: function (context, text) {
                return createChoice(
                    createInterleave(p1.textDeriv(context, text), p2),
                    createInterleave(p1, p2.textDeriv(context, text))
                );
            },
            startTagOpenDeriv: memoizeNode(function (node) {
                return createChoice(
                    applyAfter(function (p) { return createInterleave(p, p2); },
                               p1.startTagOpenDeriv(node)),
                    applyAfter(function (p) { return createInterleave(p1, p); },
                               p2.startTagOpenDeriv(node)));
            }),
            attDeriv: function (context, attribute) {
                return createChoice(
                    createInterleave(p1.attDeriv(context, attribute), p2),
                    createInterleave(p1, p2.attDeriv(context, attribute)));
            },
            startTagCloseDeriv: memoize0arg(function () {
                return createInterleave(p1.startTagCloseDeriv(),
                    p2.startTagCloseDeriv());
            })
        };
    });
    createGroup = memoize2arg("group", function (p1, p2) {
        if (p1 === notAllowed || p2 === notAllowed) { return notAllowed; }
        if (p1 === empty) { return p2; }
        if (p2 === empty) { return p1; }
    }, function (p1, p2) {
        return {
            type: "group",
            p1: p1,
            p2: p2,
            nullable: p1.nullable && p2.nullable,
            textDeriv: function (context, text) {
                var p = createGroup(p1.textDeriv(context, text), p2);
                if (p1.nullable) {
                    return createChoice(p, p2.textDeriv(context, text));
                }
                return p;
            },
            startTagOpenDeriv: function (node) {
                var x = applyAfter(function (p) { return createGroup(p, p2); },
                        p1.startTagOpenDeriv(node));
                if (p1.nullable) {
                    return createChoice(x, p2.startTagOpenDeriv(node));
                }
                return x;
            },
            attDeriv: function (context, attribute) {
                return createChoice(
                    createGroup(p1.attDeriv(context, attribute), p2),
                    createGroup(p1, p2.attDeriv(context, attribute)));
            },
            startTagCloseDeriv: memoize0arg(function () {
                return createGroup(p1.startTagCloseDeriv(),
                    p2.startTagCloseDeriv());
            })
        };
    });
    createAfter = memoize2arg("after", function (p1, p2) {
        if (p1 === notAllowed || p2 === notAllowed) { return notAllowed; }
    }, function (p1, p2) {
        return {
            type: "after",
            p1: p1,
            p2: p2,
            nullable: false,
            textDeriv: function (context, text) {
                return createAfter(p1.textDeriv(context, text), p2);
            },
            startTagOpenDeriv: memoizeNode(function (node) {
                return applyAfter(function (p) { return createAfter(p, p2); },
                    p1.startTagOpenDeriv(node));
            }),
            attDeriv: function (context, attribute) {
                return createAfter(p1.attDeriv(context, attribute), p2);
            },
            startTagCloseDeriv: memoize0arg(function () {
                return createAfter(p1.startTagCloseDeriv(), p2);
            }),
            endTagDeriv: memoize0arg(function () {
                return (p1.nullable) ? p2 : notAllowed;
            })
        };
    });
    createOneOrMore = memoize1arg("oneormore", function (p) {
        if (p === notAllowed) { return notAllowed; }
        return {
            type: "oneOrMore",
            p: p,
            nullable: p.nullable,
            textDeriv: function (context, text) {
                return createGroup(p.textDeriv(context, text),
                            createChoice(this, empty));
            },
            startTagOpenDeriv: function (node) {
                var oneOrMore = this;
                return applyAfter(function (pf) {
                    return createGroup(pf, createChoice(oneOrMore, empty));
                }, p.startTagOpenDeriv(node));
            },
            attDeriv: function (context, attribute) {
                var oneOrMore = this;
                return createGroup(p.attDeriv(context, attribute),
                    createChoice(oneOrMore, empty));
            },
            startTagCloseDeriv: memoize0arg(function () {
                return createOneOrMore(p.startTagCloseDeriv());
            })
        };
    });
    function createElement(nc, p) {
        return {
            type: "element",
            nc: nc,
            nullable: false,
            textDeriv: function () { return notAllowed; },
            startTagOpenDeriv: function (node) {
                if (nc.contains(node)) {
                    return createAfter(p, empty);
                }
                return notAllowed;
            },
            attDeriv: function (context, attribute) { return notAllowed; },
            startTagCloseDeriv: function () { return this; }
        };
    }
    function valueMatch(context, pattern, text) {
        return (pattern.nullable && /^\s+$/.test(text)) ||
                pattern.textDeriv(context, text).nullable;
    }
    createAttribute = memoize2arg("attribute", undefined, function (nc, p) {
        return {
            type: "attribute",
            nullable: false,
            nc: nc,
            p: p,
            attDeriv: function (context, attribute) {
                if (nc.contains(attribute) && valueMatch(context, p,
                        attribute.nodeValue)) {
                    return empty;
                }
                return notAllowed;
            },
            startTagCloseDeriv: function () { return notAllowed; }
        };
    });
    function createList() {
        return {
            type: "list",
            nullable: false,
            hash: "list",
            textDeriv: function (context, text) {
                return empty;
            }
        };
    }
    createValue = memoize1arg("value", function (value) {
        return {
            type: "value",
            nullable: false,
            value: value,
            textDeriv: function (context, text) {
                return (text === value) ? empty : notAllowed;
            },
            attDeriv: function () { return notAllowed; },
            startTagCloseDeriv: function () { return this; }
        };
    });
    createData = memoize1arg("data", function (type) {
        return {
            type: "data",
            nullable: false,
            dataType: type,
            textDeriv: function () { return empty; },
            attDeriv: function () { return notAllowed; },
            startTagCloseDeriv: function () { return this; }
        };
    });
    function createDataExcept() {
        return {
            type: "dataExcept",
            nullable: false,
            hash: "dataExcept"
        };
    }
    applyAfter = function applyAfter(f, p) {
        if (p.type === "after") {
            return createAfter(p.p1, f(p.p2));
        } else if (p.type === "choice") {
            return createChoice(applyAfter(f, p.p1), applyAfter(f, p.p2));
        }
        return p;
    };
    function attsDeriv(context, pattern, attributes, position) {
        if (pattern === notAllowed) {
            return notAllowed;
        }
        if (position >= attributes.length) {
            return pattern;
        }
        if (position === 0) {
            // TODO: loop over attributes to update namespace mapping
            position = 0;
        }
        var a = attributes.item(position);
        while (a.namespaceURI === xmlnsns) { // always ok
            position += 1;
            if (position >= attributes.length) {
                return pattern;
            }
            a = attributes.item(position);
        }
        a = attsDeriv(context, pattern.attDeriv(context,
                attributes.item(position)), attributes, position + 1);
        return a;
    }
    function childrenDeriv(context, pattern, walker) {
        var element = walker.currentNode,
            childNode = walker.firstChild(),
            numberOfTextNodes = 0,
            childNodes = [], i, p;
        // simple incomplete implementation: only use non-empty text nodes
        while (childNode) {
            if (childNode.nodeType === 1) {
                childNodes.push(childNode);
            } else if (childNode.nodeType === 3 &&
                    !/^\s*$/.test(childNode.nodeValue)) {
                childNodes.push(childNode.nodeValue);
                numberOfTextNodes += 1;
            }
            childNode = walker.nextSibling();
        }
        // if there is no nodes at all, add an empty text node
        if (childNodes.length === 0) {
            childNodes = [""];
        }
        p = pattern;
        for (i = 0; p !== notAllowed && i < childNodes.length; i += 1) {
            childNode = childNodes[i];
            if (typeof childNode === "string") {
                if (/^\s*$/.test(childNode)) {
                    p = createChoice(p, p.textDeriv(context, childNode));
                } else {
                    p = p.textDeriv(context, childNode);
                }
            } else {
                walker.currentNode = childNode;
                p = childDeriv(context, p, walker);
            }
        }
        walker.currentNode = element;
        return p;
    }
    childDeriv = function childDeriv(context, pattern, walker) {
        var childNode = walker.currentNode, p;
        p = pattern.startTagOpenDeriv(childNode);
        p = attsDeriv(context, p, childNode.attributes, 0);
        p = p.startTagCloseDeriv();
        p = childrenDeriv(context, p, walker);
        p = p.endTagDeriv();
        return p;
    };
    function addNames(name, ns, pattern) {
        if (pattern.e[0].a) {
            name.push(pattern.e[0].text);
            ns.push(pattern.e[0].a.ns);
        } else {
            addNames(name, ns, pattern.e[0]);
        }
        if (pattern.e[1].a) {
            name.push(pattern.e[1].text);
            ns.push(pattern.e[1].a.ns);
        } else {
            addNames(name, ns, pattern.e[1]);
        }
    }
    createNameClass = function createNameClass(pattern) {
        var name, ns, hash, i;
        if (pattern.name === "name") {
            name = pattern.text;
            ns = pattern.a.ns;
            return {
                name: name,
                ns: ns,
                hash: "{" + ns + "}" + name,
                contains: function (node) {
                    return node.namespaceURI === ns && node.localName === name;
                }
            };
        } else if (pattern.name === "choice") {
            name = [];
            ns = [];
            addNames(name, ns, pattern);
            hash = "";
            for (i = 0; i < name.length; i += 1) {
                 hash += "{" + ns[i] + "}" + name[i] + ",";
            }
            return {
                hash: hash,
                contains: function (node) {
                    var i;
                    for (i = 0; i < name.length; i += 1) {
                        if (name[i] === node.localName &&
                                ns[i] === node.namespaceURI) {
                            return true;
                        }
                    }
                    return false;
                }
            };
        }
        return {
            hash: "anyName",
            contains: function () { return true; }
        };
    };
    function resolveElement(pattern, elements) {
        var element, p, i, hash;
        // create an empty object in the store to enable circular
        // dependencies
        hash = "element" + pattern.id.toString();
        p = elements[pattern.id] = { hash: hash };
        element = createElement(createNameClass(pattern.e[0]),
            makePattern(pattern.e[1], elements));
        // copy the properties of the new object into the predefined one
        for (i in element) {
            if (element.hasOwnProperty(i)) {
                p[i] = element[i];
            }
        }
        return p;
    }
    makePattern = function makePattern(pattern, elements) {
        var p, i;
        if (pattern.name === "elementref") {
            p = pattern.id || 0;
            pattern = elements[p];
            if (pattern.name !== undefined) {
                return resolveElement(pattern, elements);
            }
            return pattern;
        }
        switch (pattern.name) {
            case 'empty':
                return empty;
            case 'notAllowed':
                return notAllowed;
            case 'text':
                return text;
            case 'choice':
                return createChoice(makePattern(pattern.e[0], elements),
                    makePattern(pattern.e[1], elements));
            case 'interleave':
                p = makePattern(pattern.e[0], elements);
                for (i = 1; i < pattern.e.length; i += 1) {
                    p = createInterleave(p, makePattern(pattern.e[i],
                            elements));
                }
                return p;
            case 'group':
                return createGroup(makePattern(pattern.e[0], elements),
                    makePattern(pattern.e[1], elements));
            case 'oneOrMore':
                return createOneOrMore(makePattern(pattern.e[0], elements));
            case 'attribute':
                return createAttribute(createNameClass(pattern.e[0]),
                    makePattern(pattern.e[1], elements));
            case 'value':
                return createValue(pattern.text);
            case 'data':
                p = pattern.a && pattern.a.type;
                if (p === undefined) {
                    p = "";
                }
                return createData(p);
            case 'list':
                return createList();
        }
        throw "No support for " + pattern.name;
    };

/*== */

    /**
     * @constructor
     * @param {!string} error
     * @param {Node=} context
     */
    function RelaxNGParseError(error, context) {
        this.message = function () {
            if (context) {
                error += (context.nodeType === 1) ? " Element " : " Node ";
                error += context.nodeName;
                if (context.nodeValue) {
                    error += " with value '" + context.nodeValue + "'";
                }
                error += ".";
            }
            return error;
        };
//        runtime.log("[" + p.slice(0, depth) + this.message() + "]");
    }
    this.newMakePattern = function newMakePattern(pattern, elements) {
        var copy = {}, i;
        for (i in elements) {
            if (elements.hasOwnProperty(i)) {
                copy[i] = elements[i];
            }
        }
        i = makePattern(pattern, copy);
        return i;
    };
    /**
     * @param elementdef
     * @param walker
     * @param {Element} element
     * @return {Array.<RelaxNGParseError>}
     */
    function validateOneOrMore(elementdef, walker, element) {
        // The list of definitions in the elements list should be completely
        // traversed at least once. If a second or later round fails, the walker
        // should go back to the start of the last successful traversal
        var node, i = 0, err;
        do {
            node = walker.currentNode;
            err = validateNonEmptyPattern(elementdef.e[0], walker, element);
            i += 1;
        } while (!err && node !== walker.currentNode);
        if (i > 1) { // at least one round was without error
            // set position back to position of before last failed round
            walker.currentNode = node;
            return null;
        }
        return err;
    }
    /**
     * @param {!Node} node
     * @return {!string}
     */
    function qName(node) {
        return nsmap[node.namespaceURI] + ":" + node.localName;
    }
    /**
     * @param {!Node} node
     * @return {!boolean}
     */
    function isWhitespace(node) {
        return node && node.nodeType === 3 && /^\s+$/.test(node.nodeValue);
    }
    /**
     * @param elementdef
     * @param walker
     * @param {Element} element
     * @param {string=} data
     * @return {Array.<RelaxNGParseError>}
     */
    function validatePattern(elementdef, walker, element, data) {
        if (elementdef.name === "empty") {
            return null;
        }
        return validateNonEmptyPattern(elementdef, walker, element, data);
    }
    /**
     * @param elementdef
     * @param walker
     * @param {Element} element
     * @return {Array.<RelaxNGParseError>}
     */
    function validateAttribute(elementdef, walker, element) {
        if (elementdef.e.length !== 2) {
            throw "Attribute with wrong # of elements: " + elementdef.e.length;
        }
        var att, a, l = elementdef.localnames.length, i;
        for (i = 0; i < l; i += 1) {
            a = element.getAttributeNS(elementdef.namespaces[i],
                    elementdef.localnames[i]);
            // if an element is not present, getAttributeNS will return an empty
            // string but an empty string is possible attribute value, so an
            // extra check is needed
            if (a === "" && !element.hasAttributeNS(elementdef.namespaces[i],
                    elementdef.localnames[i])) {
                a = undefined;
            }
            if (att !== undefined && a !== undefined) {
                return [new RelaxNGParseError("Attribute defined too often.",
                        element)];
            }
            att = a;
        }
        if (att === undefined) {
            return [new RelaxNGParseError("Attribute not found: " +
                    elementdef.names, element)];
        }
        return validatePattern(elementdef.e[1], walker, element, att);
    }
    /**
     * @param elementdef
     * @param walker
     * @param {Element} element
     * @return {Array.<RelaxNGParseError>}
     */
    function validateTop(elementdef, walker, element) {
        // notAllowed not implemented atm
        return validatePattern(elementdef, walker, element);
    }
    /**
     * Validate an element.
     * Function forwards the walker until an element is met.
     * If element if of the right type, it is entered and the validation
     * continues inside the element. After validation, regardless of whether an
     * error occurred, the walker is at the same depth in the dom tree.
     * @param elementdef
     * @param walker
     * @param {Element} element
     * @return {Array.<RelaxNGParseError>}
     */
    function validateElement(elementdef, walker, element) {
        if (elementdef.e.length !== 2) {
            throw "Element with wrong # of elements: " + elementdef.e.length;
        }
        depth += 1;
        // forward until an element is seen, then check the name
        var /**@type{Node}*/ node = walker.currentNode,
            /**@type{number}*/ type = node ? node.nodeType : 0,
            error = null;
        // find the next element, skip text nodes with only whitespace
        while (type > 1) {
            if (type !== 8 &&
                    (type !== 3 ||
                     !/^\s+$/.test(walker.currentNode.nodeValue))) {// TEXT_NODE
                depth -= 1;
                return [new RelaxNGParseError("Not allowed node of type " +
                        type + ".")];
            }
            node = walker.nextSibling();
            type = node ? node.nodeType : 0;
        }
        if (!node) {
            depth -= 1;
            return [new RelaxNGParseError("Missing element " +
                    elementdef.names)];
        }
        if (elementdef.names && elementdef.names.indexOf(qName(node)) === -1) {
            depth -= 1;
            return [new RelaxNGParseError("Found " + node.nodeName +
                    " instead of " + elementdef.names + ".", node)];
        }
        // the right element was found, now parse the contents
        if (walker.firstChild()) {
            // currentNode now points to the first child node of this element
            error = validateTop(elementdef.e[1], walker, node);
            // there should be no content left
            while (walker.nextSibling()) {
                type = walker.currentNode.nodeType;
                if (!isWhitespace(walker.currentNode) && type !== 8) {
                    depth -= 1;
                    return [new RelaxNGParseError("Spurious content.",
                            walker.currentNode)];
                }
            }
            if (walker.parentNode() !== node) {
                depth -= 1;
                return [new RelaxNGParseError("Implementation error.")];
            }
        } else {
            error = validateTop(elementdef.e[1], walker, node);
        }
        depth -= 1;
        // move to the next node
        node = walker.nextSibling();
        return error;
    }
    /**
     * @param elementdef
     * @param walker
     * @param {Element} element
     * @param {string=} data
     * @return {Array.<RelaxNGParseError>}
     */
    function validateChoice(elementdef, walker, element, data) {
        // loop through child definitions and return if a match is found
        if (elementdef.e.length !== 2) {
            throw "Choice with wrong # of options: " + elementdef.e.length;
        }
        var node = walker.currentNode, err;
        // if the first option is empty, just check the second one for debugging
        // but the total choice is alwasy ok
        if (elementdef.e[0].name === "empty") {
            err = validateNonEmptyPattern(elementdef.e[1], walker, element,
                    data);
            if (err) {
                walker.currentNode = node;
            }
            return null;
        }
        err = validatePattern(elementdef.e[0], walker, element, data);
        if (err) {
            walker.currentNode = node;
            err = validateNonEmptyPattern(elementdef.e[1], walker, element,
                    data);
        }
        return err;
    }
    /**
     * @param elementdef
     * @param walker
     * @param {Element} element
     * @return {Array.<RelaxNGParseError>}
     */
    function validateInterleave(elementdef, walker, element) {
        var l = elementdef.e.length, n = new Array(l), err, i, todo = l,
            donethisround, node, subnode, e;
        // the interleave is done when all items are 'true' and no 
        while (todo > 0) {
            donethisround = 0;
            node = walker.currentNode;
            for (i = 0; i < l; i += 1) {
                subnode = walker.currentNode;
                if (n[i] !== true && n[i] !== subnode) {
                    e = elementdef.e[i];
                    err = validateNonEmptyPattern(e, walker, element);
                    if (err) {
                        walker.currentNode = subnode;
                        if (n[i] === undefined) {
                            n[i] = false;
                        }
                    } else if (subnode === walker.currentNode ||
                            // this is a bit dodgy, there should be a rule to
                            // see if multiple elements are allowed
                            e.name === "oneOrMore" ||
                            (e.name === "choice" &&
                            (e.e[0].name === "oneOrMore" ||
                             e.e[1].name === "oneOrMore"))) {
                        donethisround += 1;
                        n[i] = subnode; // no error and try this one again later
                    } else {
                        donethisround += 1;
                        n[i] = true; // no error and progress
                    }
                }
            }
            if (node === walker.currentNode && donethisround === todo) {
                return null;
            }
            if (donethisround === 0) {
                for (i = 0; i < l; i += 1) {
                    if (n[i] === false) {
                        return [new RelaxNGParseError(
                                "Interleave does not match.", element)];
                    }
                }
                return null;
            }
            todo = 0;
            for (i = 0; i < l; i += 1) {
                if (n[i] !== true) {
                    todo += 1;
                }
            }
        }
        return null;
    }
    /**
     * @param elementdef
     * @param walker
     * @param {Element} element
     * @return {Array.<RelaxNGParseError>}
     */
    function validateGroup(elementdef, walker, element) {
        if (elementdef.e.length !== 2) {
            throw "Group with wrong # of members: " + elementdef.e.length;
        }
        //runtime.log(elementdef.e[0].name + " " + elementdef.e[1].name);
        return validateNonEmptyPattern(elementdef.e[0], walker, element) ||
                validateNonEmptyPattern(elementdef.e[1], walker, element);
    }
    /**
     * @param elementdef
     * @param walker
     * @param {Element} element
     * @return {Array.<RelaxNGParseError>}
     */
    function validateText(elementdef, walker, element) {
        var /**@type{Node}*/ node = walker.currentNode,
            /**@type{number}*/ type = node ? node.nodeType : 0,
            error = null;
        // find the next element, skip text nodes with only whitespace
        while (node !== element && type !== 3) {
            if (type === 1) {
                return [new RelaxNGParseError(
                        "Element not allowed here.", node)];
            }
            node = walker.nextSibling();
            type = node ? node.nodeType : 0;
        }
        walker.nextSibling();
        return null;
    }
    /**
     * @param elementdef
     * @param walker
     * @param {Element} element
     * @param {string=} data
     * @return {Array.<RelaxNGParseError>}
     */
    validateNonEmptyPattern = function validateNonEmptyPattern(elementdef,
                walker, element, data) {
        var name = elementdef.name, err = null;
        if (name === "text") {
            err = validateText(elementdef, walker, element);
        } else if (name === "data") {
            err = null; // data not implemented
        } else if (name === "value") {
            if (data !== elementdef.text) {
                err = [new RelaxNGParseError("Wrong value, should be '" +
                        elementdef.text + "', not '" + data + "'", element)];
            }
        } else if (name === "list") {
            err = null; // list not implemented
        } else if (name === "attribute") {
            err = validateAttribute(elementdef, walker, element);
        } else if (name === "element") {
            err = validateElement(elementdef, walker, element);
        } else if (name === "oneOrMore") {
            err = validateOneOrMore(elementdef, walker, element);
        } else if (name === "choice") {
            err = validateChoice(elementdef, walker, element, data);
        } else if (name === "group") {
            err = validateGroup(elementdef, walker, element);
        } else if (name === "interleave") {
            err = validateInterleave(elementdef, walker, element);
        } else {
            throw name + " not allowed in nonEmptyPattern.";
        }
        return err;
    };
    /**
     * Validate the elements pointed to by the TreeWalker
     * @param {!TreeWalker} walker
     * @param {!function(Array.<RelaxNGParseError>):undefined} callback
     * @return {undefined}
     */
    function validateXML(walker, callback) {
        walker.currentNode = walker.root;
        var errors = validatePattern(start.e[0], walker, walker.root);
        callback(errors);

        walker.currentNode = walker.root;
        errors = childDeriv(null, rootPattern, walker);
        if (!errors.nullable) {
            runtime.log("Error parsing.");
        }
    }
    this.validate = validateXML;
    this.init = function init(start1, rootPattern1, nsmap1) {
        start = start1;
        rootPattern = rootPattern1;
        nsmap = nsmap1;
    };
};
