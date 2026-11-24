/**
 * plasma widget listing the accounts of borealis
 *
 * talks to the app over the session bus, calling any method starts the app
 * through dbus activation when it isn't running
 */
import QtQuick
import QtQuick.Layouts

import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.extras as PlasmaExtras
import org.kde.plasma.plasmoid
import org.kde.plasma.workspace.dbus as DBus

PlasmoidItem {
    id: root

    /**
     * name, object and interface of the app on the session bus
     */
    readonly property string service: "dev.danfq.Borealis"
    readonly property string path: "/dev/danfq/Borealis"

    /**
     * accounts reported by the app, with their unread chats
     */
    property var accounts: []

    /**
     * unread chats across every account
     */
    readonly property int unread: accounts.reduce((total, account) => total + account.unread, 0)

    readonly property bool running: watcher.registered

    Plasmoid.icon: Qt.resolvedUrl("../images/icon.svg")
    Plasmoid.title: "Borealis"

    toolTipMainText: "Borealis"
    toolTipSubText: {
        if (!running) return i18n("Not running");
        if (unread === 0) return i18n("No unread chats");

        return i18np("%1 unread chat", "%1 unread chats", unread);
    }

    DBus.DBusServiceWatcher {
        id: watcher

        busType: DBus.BusType.Session
        watchedService: root.service

        onRegisteredChanged: root.refresh()
    }

    /**
     * the app has no signals the widget can follow, so it asks every few
     * seconds, more often while the popup is open
     */
    Timer {
        interval: root.expanded ? 2000 : 5000
        running: root.running
        repeat: true
        triggeredOnStart: true

        onTriggered: root.refresh()
    }

    /**
     * call a method of the app, starting it when it isn't running
     *
     * @param member method name
     * @param args method arguments
     * @param destination bus name to call, the app's own name by default
     *
     * @returns {DBusPendingReply} reply
     */
    function call(member, args = [], destination = root.service) {
        return DBus.SessionBus.asyncCall({
            service: destination,
            path: root.path,
            iface: root.service,
            member: member,
            arguments: args,
        });
    }

    /**
     * read the accounts from the app
     *
     * asks the connection holding the name rather than the name itself, which
     * would start the app again right as it quits
     */
    function refresh() {
        if (!watcher.registered) {
            accounts = [];
            return;
        }

        const owner = DBus.SessionBus.asyncCall({
            service: "org.freedesktop.DBus",
            path: "/org/freedesktop/DBus",
            iface: "org.freedesktop.DBus",
            member: "GetNameOwner",
            arguments: [root.service],
        });

        owner.finished.connect(() => {
            if (!owner.isValid) {
                accounts = [];
                return;
            }

            const reply = call("State", [], owner.value);

            reply.finished.connect(() => {
                if (!reply.isValid) return;

                try {
                    accounts = JSON.parse(reply.value).accounts;
                } catch (error) {
                    accounts = [];
                }
            });
        });
    }

    /**
     * open an account in the app and close the popup
     *
     * @param id account id
     */
    function open(id) {
        call("OpenAccount", [id]);
        root.expanded = false;
    }

    /**
     * bring up the app, starting it when needed
     */
    function show() {
        call("Show");
        root.expanded = false;
    }

    /**
     * open the settings of the app
     */
    function settings() {
        call("OpenSettings");
        root.expanded = false;
    }

    /**
     * initials shown in place of an account picture
     *
     * @param name display name
     *
     * @returns {string} up to two initials
     */
    function initials(name) {
        return name
            .split(/\s+/)
            .filter(word => word.length > 0)
            .slice(0, 2)
            .map(word => word[0].toUpperCase())
            .join("");
    }

    compactRepresentation: MouseArea {
        id: compact

        hoverEnabled: true
        acceptedButtons: Qt.LeftButton | Qt.MiddleButton

        onClicked: mouse => {
            if (mouse.button === Qt.MiddleButton) root.show();
            else root.expanded = !root.expanded;
        }

        Kirigami.Icon {
            anchors.fill: parent
            source: Plasmoid.icon
            active: compact.containsMouse
        }

        Rectangle {
            visible: root.unread > 0
            anchors.right: parent.right
            anchors.top: parent.top
            height: Math.max(Kirigami.Units.iconSizes.small * 0.75, badge.implicitHeight)
            width: Math.max(height, badge.implicitWidth + Kirigami.Units.smallSpacing * 2)
            radius: height / 2
            color: Kirigami.Theme.highlightColor

            PlasmaComponents.Label {
                id: badge

                anchors.centerIn: parent
                text: root.unread > 99 ? "99+" : root.unread
                color: Kirigami.Theme.highlightedTextColor
                font.pointSize: Kirigami.Theme.smallFont.pointSize
                font.bold: true
            }
        }
    }

    fullRepresentation: PlasmaExtras.Representation {
        Layout.minimumWidth: Kirigami.Units.gridUnit * 14
        Layout.minimumHeight: Kirigami.Units.gridUnit * 10
        Layout.preferredWidth: Kirigami.Units.gridUnit * 18
        Layout.preferredHeight: Kirigami.Units.gridUnit * 16

        collapseMarginsHint: true

        header: PlasmaExtras.PlasmoidHeading {
            RowLayout {
                anchors.fill: parent

                PlasmaExtras.Heading {
                    Layout.fillWidth: true
                    level: 3
                    text: "Borealis"
                }

                PlasmaComponents.ToolButton {
                    icon.name: "window"
                    text: i18n("Open Borealis")
                    display: PlasmaComponents.AbstractButton.IconOnly

                    onClicked: root.show()

                    PlasmaComponents.ToolTip.text: text
                    PlasmaComponents.ToolTip.visible: hovered
                }

                PlasmaComponents.ToolButton {
                    visible: root.running
                    icon.name: "configure"
                    text: i18n("Settings")
                    display: PlasmaComponents.AbstractButton.IconOnly

                    onClicked: root.settings()

                    PlasmaComponents.ToolTip.text: text
                    PlasmaComponents.ToolTip.visible: hovered
                }
            }
        }

        PlasmaComponents.ScrollView {
            anchors.fill: parent

            ListView {
                id: list

                model: root.accounts
                spacing: Kirigami.Units.smallSpacing
                topMargin: Kirigami.Units.smallSpacing
                bottomMargin: Kirigami.Units.smallSpacing

                delegate: PlasmaComponents.ItemDelegate {
                    id: item

                    required property var modelData
                    required property int index

                    width: ListView.view.width
                    highlighted: modelData.active

                    onClicked: root.open(modelData.id)

                    contentItem: RowLayout {
                        spacing: Kirigami.Units.largeSpacing

                        Rectangle {
                            Layout.preferredWidth: Kirigami.Units.iconSizes.medium
                            Layout.preferredHeight: Kirigami.Units.iconSizes.medium
                            radius: width / 2
                            color: Kirigami.Theme.alternateBackgroundColor

                            PlasmaComponents.Label {
                                anchors.centerIn: parent
                                text: root.initials(item.modelData.name)
                                font.bold: true
                            }
                        }

                        PlasmaComponents.Label {
                            Layout.fillWidth: true
                            text: item.modelData.name
                            elide: Text.ElideRight
                        }

                        Rectangle {
                            visible: item.modelData.unread > 0
                            Layout.preferredHeight: count.implicitHeight + Kirigami.Units.smallSpacing
                            Layout.preferredWidth: Math.max(height, count.implicitWidth + Kirigami.Units.largeSpacing)
                            radius: height / 2
                            color: Kirigami.Theme.highlightColor

                            PlasmaComponents.Label {
                                id: count

                                anchors.centerIn: parent
                                text: item.modelData.unread > 99 ? "99+" : item.modelData.unread
                                color: Kirigami.Theme.highlightedTextColor
                                font.bold: true
                            }
                        }
                    }
                }

                PlasmaExtras.PlaceholderMessage {
                    anchors.centerIn: parent
                    width: parent.width - Kirigami.Units.gridUnit * 2
                    visible: list.count === 0
                    iconName: root.running ? "user-identity" : "system-run"
                    text: root.running ? i18n("No accounts yet") : i18n("Borealis isn't running")
                    explanation: root.running ? i18n("Add a WhatsApp account in Borealis to see it here.") : ""

                    helpfulAction: Kirigami.Action {
                        icon.name: "window"
                        text: i18n("Open Borealis")

                        onTriggered: root.show()
                    }
                }
            }
        }
    }
}
